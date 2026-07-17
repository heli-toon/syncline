import React, { useState, useEffect } from "react";
import QRCode from "qrcode";
import { Copy, Check, Camera, Wifi, X, ArrowRight, ArrowLeft, QrCode, RefreshCw } from "lucide-react";
import { ConnectionState } from "../types";
import QRScanner from "./QRScanner";

interface ManualConnectionModalProps {
  connectionState: ConnectionState;
  onClose: () => void;
  onHostInit: (onOfferReady: (offerStr: string) => void) => void;
  onJoinOffer: (offerStr: string, onAnswerReady: (answerStr: string) => void) => void;
  onHostComplete: (answerStr: string) => void;
}

// Compress string to compact Base64 with fallback
async function compressString(str: string): Promise<string> {
  if (typeof CompressionStream === "undefined") {
    return str;
  }
  try {
    const bytes = new TextEncoder().encode(str);
    const stream = new Response(bytes).body?.pipeThrough(new CompressionStream("deflate"));
    const compressedArrayBuffer = await new Response(stream).arrayBuffer();
    let binary = "";
    const len = compressedArrayBuffer.byteLength;
    const uint8 = new Uint8Array(compressedArrayBuffer);
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(uint8[i]);
    }
    return btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, ""); // URL-safe base64
  } catch (err) {
    console.error("Compression error:", err);
    return str;
  }
}

// Decompress compact Base64 to string with fallback
async function decompressString(compressedBase64: string): Promise<string> {
  if (typeof DecompressionStream === "undefined") {
    return compressedBase64;
  }
  try {
    let base64 = compressedBase64.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) base64 += "=";
    
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    const stream = new Response(bytes).body?.pipeThrough(new DecompressionStream("deflate"));
    const arrayBuffer = await new Response(stream).arrayBuffer();
    return new TextDecoder().decode(arrayBuffer);
  } catch (err) {
    console.error("Decompression error:", err);
    return compressedBase64;
  }
}

const compressSafe = async (str: string): Promise<string> => {
  try {
    return await compressString(str);
  } catch (e) {
    return str;
  }
};

const decompressIfNeeded = async (str: string): Promise<string> => {
  const trimmed = str.trim();
  if (trimmed.startsWith("{")) {
    return trimmed; // Already raw JSON
  }
  try {
    const decompressed = await decompressString(trimmed);
    if (decompressed.startsWith("{")) {
      return decompressed;
    }
  } catch (e) {
    console.warn("Decompression failed, using raw string:", e);
  }
  return trimmed;
};

const publishSignal = async (topic: string, bodyStr: string) => {
  try {
    await fetch(`https://ntfy.sh/${topic}`, {
      method: "POST",
      body: bodyStr,
      headers: {
        "X-Cache": "yes"
      }
    });
  } catch (e) {
    console.error("Signal publication failed:", e);
  }
};

const fetchSignal = async (topic: string): Promise<string | null> => {
  try {
    const res = await fetch(`https://ntfy.sh/${topic}/json?poll=1`);
    if (!res.ok) return null;
    const text = await res.text();
    const lines = text.trim().split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      if (!lines[i]) continue;
      try {
        const parsed = JSON.parse(lines[i]);
        if (parsed.message && parsed.event === "message") {
          return parsed.message;
        }
      } catch (e) {
        // ignore
      }
    }
  } catch (e) {
    console.error("Signal fetch failed:", e);
  }
  return null;
};

export default function ManualConnectionModal({
  connectionState,
  onClose,
  onHostInit,
  onJoinOffer,
  onHostComplete,
}: ManualConnectionModalProps) {
  const [activeTab, setActiveTab] = useState<"host" | "join">("host");
  const [step, setStep] = useState<number>(1);
  const [copied, setCopied] = useState<boolean>(false);
  const [scannerOpen, setScannerOpen] = useState<boolean>(false);
  const [pastedValue, setPastedValue] = useState<string>("");

  // Host States
  const [hostOffer, setHostOffer] = useState<string>("");
  const [hostOfferQR, setHostOfferQR] = useState<string>("");
  const [generatingOffer, setGeneratingOffer] = useState<boolean>(false);

  // Joiner States
  const [joinOfferInput, setJoinOfferInput] = useState<string>("");
  const [joinAnswer, setJoinAnswer] = useState<string>("");
  const [joinAnswerQR, setJoinAnswerQR] = useState<string>("");
  const [generatingAnswer, setGeneratingAnswer] = useState<boolean>(false);

  // Pairing Code States
  const [pairingCode, setPairingCode] = useState<string>("");
  const [joinCodeInput, setJoinCodeInput] = useState<string>("");
  const [joiningWithCode, setJoiningWithCode] = useState<boolean>(false);
  const [joinCodeError, setJoinCodeError] = useState<string>("");

  // Auto-close modal when connected!
  useEffect(() => {
    if (connectionState === "connected") {
      onClose();
    }
  }, [connectionState, onClose]);

  // Host polling answer loop
  useEffect(() => {
    if (activeTab !== "host" || step !== 2 || !pairingCode) return;

    let active = true;
    const interval = setInterval(async () => {
      if (!active) return;
      const topic = `p2p-share-group-${pairingCode}-answer`;
      const compressedAnswer = await fetchSignal(topic);
      if (compressedAnswer && active) {
        clearInterval(interval);
        active = false;
        submitPeerAnswer(compressedAnswer);
      }
    }, 2500);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [activeTab, step, pairingCode]);

  // Copy helper with iframe fallback
  const handleCopy = (text: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          })
          .catch(() => {
            fallbackCopy(text);
          });
      } else {
        fallbackCopy(text);
      }
    } catch (e) {
      fallbackCopy(text);
    }
  };

  const fallbackCopy = (text: string) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      const successful = document.execCommand('copy');
      if (successful) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        console.error("Fallback copy failed");
      }
    } catch (err) {
      console.error("Fallback copy error:", err);
    }
    document.body.removeChild(textArea);
  };

  // Tab transitions
  const handleTabChange = (tab: "host" | "join") => {
    setActiveTab(tab);
    setStep(1);
    setPastedValue("");
    setJoinOfferInput("");
    setJoinAnswer("");
    setJoinAnswerQR("");
    setHostOffer("");
    setHostOfferQR("");
    setPairingCode("");
    setJoinCodeInput("");
    setJoinCodeError("");
    setJoiningWithCode(false);
  };

  // Host - Start Group Invitation
  const initHostGroup = () => {
    setGeneratingOffer(true);
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setPairingCode(code);

    onHostInit(async (offerStr) => {
      const compressed = await compressSafe(offerStr);
      setHostOffer(compressed);
      
      QRCode.toDataURL(compressed, { margin: 2, scale: 6 })
        .then((url) => setHostOfferQR(url))
        .catch((err) => console.error("QR Generation error:", err));

      // Publish offer on ntfy
      await publishSignal(`p2p-share-group-${code}-offer`, compressed);

      setGeneratingOffer(false);
      setStep(2);
    });
  };

  // Joiner - Set Host Invite and Generate Answer
  const submitHostInvite = async (inviteStr: string) => {
    if (!inviteStr.trim()) return;
    setGeneratingAnswer(true);
    const decompressed = await decompressIfNeeded(inviteStr);
    onJoinOffer(decompressed, async (answerStr) => {
      const compressedAnswer = await compressSafe(answerStr);
      setJoinAnswer(compressedAnswer);
      
      QRCode.toDataURL(compressedAnswer, { margin: 2, scale: 6 })
        .then((url) => setJoinAnswerQR(url))
        .catch((err) => console.error("QR Generation error:", err));

      if (joinCodeInput) {
        await publishSignal(`p2p-share-group-${joinCodeInput}-answer`, compressedAnswer);
      }
      
      setGeneratingAnswer(false);
      setStep(2);
    });
  };

  // Joiner - Join with Pairing Code
  const handleJoinWithCode = async () => {
    if (joinCodeInput.length !== 6) return;
    setJoinCodeError("");
    setJoiningWithCode(true);

    try {
      const topic = `p2p-share-group-${joinCodeInput}-offer`;
      const compressedOffer = await fetchSignal(topic);
      if (!compressedOffer) {
        setJoinCodeError("Pairing code not found. Please ensure the host is ready.");
        setJoiningWithCode(false);
        return;
      }

      const offerStr = await decompressIfNeeded(compressedOffer);
      
      onJoinOffer(offerStr, async (answerStr) => {
        const compressedAnswer = await compressSafe(answerStr);
        setJoinAnswer(compressedAnswer);
        
        const answerTopic = `p2p-share-group-${joinCodeInput}-answer`;
        await publishSignal(answerTopic, compressedAnswer);
        
        setPairingCode(joinCodeInput);
        setStep(2);
        setJoiningWithCode(false);
      });
    } catch (err) {
      console.error("Pairing code join error:", err);
      setJoinCodeError("Failed to connect using code. Try scanning QR.");
      setJoiningWithCode(false);
    }
  };

  // Host/Joiner - Complete manual peer answer
  const submitPeerAnswer = async (answerStr: string) => {
    if (!answerStr.trim()) return;
    const decompressed = await decompressIfNeeded(answerStr);
    onHostComplete(decompressed);
    onClose();
  };

  // Scanner callbacks
  const handleQRScan = (scannedData: string) => {
    setScannerOpen(false);
    if (activeTab === "host") {
      submitPeerAnswer(scannedData);
    } else {
      setJoinOfferInput(scannedData);
      submitHostInvite(scannedData);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-fade-in">
      {scannerOpen && (
        <QRScanner
          onScan={handleQRScan}
          onClose={() => setScannerOpen(false)}
        />
      )}

      <div className="w-full max-w-lg bg-[#0a0a0b]/95 border border-white/5 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/5 bg-[#18181b]/50">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-500/10 rounded-xl">
              <Wifi className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100 text-lg">Local P2P Connector</h3>
              <p className="text-[10px] text-slate-500 font-mono">SECURE INTERNET-FREE LINK</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 bg-[#18181b] hover:bg-[#27272a] text-slate-400 hover:text-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Controls */}
        {step === 1 && (
          <div className="flex p-1 bg-black/60 m-4 rounded-xl border border-white/5">
            <button
              onClick={() => handleTabChange("host")}
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all cursor-pointer ${
                activeTab === "host"
                  ? "bg-[#18181b] text-blue-400 shadow-sm border border-white/5"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Start Share Group
            </button>
            <button
              onClick={() => handleTabChange("join")}
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all cursor-pointer ${
                activeTab === "join"
                  ? "bg-[#18181b] text-blue-400 shadow-sm border border-white/5"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Join Group
            </button>
          </div>
        )}

        <div className="flex-1 p-6 overflow-y-auto">
          {/* TAB 1: HOST FLOW */}
          {activeTab === "host" && (
            <div className="space-y-5">
              {/* Step 1: Init Offer Button */}
              {step === 1 && (
                <div className="flex flex-col items-center justify-center py-6 text-center space-y-5">
                  <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20 text-blue-400 animate-pulse">
                    <QrCode className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-semibold text-slate-200 text-sm">Create high-speed pairing invite</h4>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto">
                      Initializes a direct P2P connection group, allowing nearby devices to join.
                    </p>
                  </div>
                  <button
                    onClick={initHostGroup}
                    disabled={generatingOffer}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/15 active:scale-[0.98] transition-all flex items-center justify-center space-x-2 cursor-pointer"
                  >
                    {generatingOffer ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>Compiling Local Address...</span>
                      </>
                    ) : (
                      <>
                        <span>Start Hosting Session</span>
                        <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Step 2: Show Invite, Wait for Answer */}
              {step === 2 && (
                <div className="space-y-5">
                  <div className="text-center space-y-1">
                    <h4 className="font-semibold text-slate-200 text-sm">Device Pairing Mode</h4>
                    <p className="text-xs text-slate-400">
                      Share using the pairing code or scan the QR code to connect.
                    </p>
                  </div>

                  {/* Pairing Code Card */}
                  <div className="bg-blue-600/10 border border-blue-500/20 rounded-2xl p-4 text-center space-y-1">
                    <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-blue-400">Pairing Code</span>
                    <div className="text-3xl font-extrabold font-mono text-white tracking-widest flex items-center justify-center space-x-2">
                      <span>{pairingCode.substring(0, 3)}</span>
                      <span className="text-blue-500/50">-</span>
                      <span>{pairingCode.substring(3)}</span>
                    </div>
                    <p className="text-[10px] text-slate-400">
                      Enter this code on the joining device to link instantly.
                    </p>
                  </div>

                  <div className="flex flex-col items-center justify-center py-1">
                    <div className="bg-white p-3 rounded-2xl shadow-xl overflow-hidden max-w-[180px] aspect-square flex items-center justify-center border border-blue-500/30">
                      {hostOfferQR ? (
                        <img src={hostOfferQR} alt="Offer QR" className="w-full h-full" />
                      ) : (
                        <div className="w-36 h-36 bg-slate-100 animate-pulse rounded-lg flex items-center justify-center text-slate-400 text-xs">
                          Generating QR...
                        </div>
                      )}
                    </div>
                    
                    <div className="flex space-x-2 mt-4 w-full max-w-[280px]">
                      <button
                        onClick={() => handleCopy(hostOffer)}
                        className="flex-1 py-1.5 px-3 bg-[#18181b] text-slate-300 hover:text-slate-100 hover:bg-zinc-800 font-medium border border-white/5 rounded-lg text-xs transition-colors flex items-center justify-center space-x-1.5 cursor-pointer"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-blue-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copied ? "Copied!" : "Copy Payload"}</span>
                      </button>
                      <button
                        onClick={() => {
                          setStep(1);
                          setPairingCode("");
                        }}
                        className="py-1.5 px-3 bg-[#18181b] border border-white/5 text-slate-400 hover:text-slate-200 font-medium rounded-lg text-xs transition-colors cursor-pointer"
                      >
                        Reset
                      </button>
                    </div>
                  </div>

                  {/* Manual fallback option */}
                  <div className="border-t border-white/5 pt-4 space-y-3">
                    <div className="text-center space-y-1">
                      <h4 className="font-medium text-slate-200 text-xs uppercase tracking-wider">Manual Connection Fallback</h4>
                      <p className="text-[11px] text-slate-500">
                        If pairing code/QR scanning is stuck, scan peer's QR or paste their Answer manually.
                      </p>
                    </div>

                    <div className="flex flex-col space-y-2">
                      <button
                        onClick={() => setScannerOpen(true)}
                        className="w-full py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 font-medium border border-blue-500/20 rounded-xl text-xs transition-all flex items-center justify-center space-x-2 active:scale-[0.98] cursor-pointer"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>Scan Joining QR Answer</span>
                      </button>
                      
                      <div className="flex items-center space-x-2 my-0.5">
                        <div className="h-px bg-white/5 flex-1"></div>
                        <span className="text-[9px] text-slate-600 font-mono uppercase tracking-wider">or paste answer string</span>
                        <div className="h-px bg-white/5 flex-1"></div>
                      </div>

                      <textarea
                        value={pastedValue}
                        onChange={(e) => setPastedValue(e.target.value)}
                        placeholder="Paste Answer connection string from peer..."
                        className="w-full h-12 bg-[#18181b] border border-white/5 rounded-xl p-2 text-xs text-slate-300 font-mono focus:outline-none focus:border-blue-500 transition-colors resize-none"
                      />

                      <button
                        onClick={() => submitPeerAnswer(pastedValue)}
                        disabled={!pastedValue.trim()}
                        className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold rounded-xl text-xs transition-colors cursor-pointer"
                      >
                        Establish Connection
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: JOIN CONNECTION FLOW */}
          {activeTab === "join" && (
            <div className="space-y-5">
              {/* Step 1: Join / Scan Offer */}
              {step === 1 && (
                <div className="space-y-4">
                  {/* Pairing Code Section */}
                  <div className="bg-blue-600/5 border border-blue-500/10 rounded-2xl p-4.5 space-y-3">
                    <div className="text-center space-y-1">
                      <h4 className="font-semibold text-slate-200 text-sm">Join with Pairing Code</h4>
                      <p className="text-xs text-slate-400">Enter the 6-digit code shown on the host device.</p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        maxLength={6}
                        placeholder="e.g. 519302"
                        value={joinCodeInput}
                        onChange={(e) => setJoinCodeInput(e.target.value.replace(/\D/g, ""))}
                        className="flex-1 bg-[#18181b] border border-white/5 rounded-xl px-4 py-3 sm:py-2 text-center font-mono font-bold text-lg tracking-widest text-blue-400 placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                      />
                      <button
                        onClick={handleJoinWithCode}
                        disabled={joinCodeInput.length !== 6 || joiningWithCode}
                        className="py-3 sm:py-2 px-5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold rounded-xl text-sm sm:text-xs transition-all active:scale-95 flex items-center justify-center space-x-1.5 cursor-pointer min-h-[44px]"
                      >
                        {joiningWithCode ? (
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <span>Join Group</span>
                        )}
                      </button>
                    </div>
                    {joinCodeError && (
                      <p className="text-center text-[11px] text-rose-400 font-medium">{joinCodeError}</p>
                    )}
                  </div>

                  <div className="flex items-center space-x-2 my-1">
                    <div className="h-px bg-white/5 flex-1"></div>
                    <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">or scan QR invitation</span>
                    <div className="h-px bg-white/5 flex-1"></div>
                  </div>

                  <button
                    onClick={() => setScannerOpen(true)}
                    className="w-full py-3 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 font-medium border border-blue-500/20 rounded-xl text-sm transition-all flex items-center justify-center space-x-2 active:scale-[0.98] cursor-pointer"
                  >
                    <Camera className="w-5 h-5" />
                    <span>Scan Host's QR Invitation</span>
                  </button>

                  <div className="flex items-center space-x-2 my-1">
                    <div className="h-px bg-white/5 flex-1"></div>
                    <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">or paste invitation string</span>
                    <div className="h-px bg-white/5 flex-1"></div>
                  </div>

                  <textarea
                    value={joinOfferInput}
                    onChange={(e) => setJoinOfferInput(e.target.value)}
                    placeholder="Paste SDP invitation payload from host..."
                    className="w-full h-16 bg-[#18181b] border border-white/5 rounded-xl p-2.5 text-xs text-slate-300 font-mono focus:outline-none focus:border-blue-500 transition-colors resize-none"
                  />

                  <button
                    onClick={() => submitHostInvite(joinOfferInput)}
                    disabled={generatingAnswer || !joinOfferInput.trim()}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold rounded-xl text-sm transition-all flex items-center justify-center space-x-2 active:scale-[0.98] cursor-pointer"
                  >
                    {generatingAnswer ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>Setting host details...</span>
                      </>
                    ) : (
                      <>
                        <span>Accept Manual Invitation</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Step 2: Show Answer */}
              {step === 2 && (
                <div className="space-y-4">
                  {pairingCode ? (
                    /* Auto linking with Pairing Code state */
                    <div className="py-6 flex flex-col items-center justify-center text-center space-y-4">
                      <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20 text-blue-400">
                        <RefreshCw className="w-8 h-8 animate-spin" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="font-semibold text-slate-200 text-sm">Linking Devices...</h4>
                        <p className="text-xs text-slate-400 max-w-xs mx-auto">
                          Published connection credentials back to host. Waiting for the WebRTC channel to handshake...
                        </p>
                      </div>
                      <div className="bg-black/30 px-3.5 py-1.5 border border-white/5 rounded-full">
                        <span className="text-[10px] font-mono font-bold text-blue-400">PAIRING CODE: {pairingCode}</span>
                      </div>
                    </div>
                  ) : (
                    /* Manual connection answer exchange */
                    <>
                      <div className="text-center space-y-1">
                        <h4 className="font-semibold text-slate-200 text-sm">Step 2: Show Answer to Host</h4>
                        <p className="text-xs text-slate-400 max-w-sm mx-auto">
                          Let the Host device scan this QR code or copy this Answer string back to complete the link.
                        </p>
                      </div>

                      <div className="flex flex-col items-center justify-center py-2">
                        <div className="bg-white p-3 rounded-2xl shadow-xl overflow-hidden max-w-[200px] aspect-square flex items-center justify-center border border-blue-500/30">
                          {joinAnswerQR ? (
                            <img src={joinAnswerQR} alt="Answer QR" className="w-full h-full" />
                          ) : (
                            <div className="w-44 h-44 bg-slate-100 animate-pulse rounded-lg flex items-center justify-center text-slate-400 text-xs">
                              Generating Answer QR...
                            </div>
                          )}
                        </div>
                        <div className="flex space-x-2 mt-4 w-full max-w-[280px]">
                          <button
                            onClick={() => handleCopy(joinAnswer)}
                            className="flex-1 py-1.5 px-3 bg-[#18181b] text-slate-300 hover:text-slate-100 hover:bg-zinc-800 font-medium border border-white/5 rounded-lg text-xs transition-colors flex items-center justify-center space-x-1 cursor-pointer"
                          >
                            {copied ? <Check className="w-3.5 h-3.5 text-blue-400" /> : <Copy className="w-3.5 h-3.5" />}
                            <span>{copied ? "Copied!" : "Copy Answer"}</span>
                          </button>
                          <button
                            onClick={() => setStep(1)}
                            className="py-1.5 px-3 bg-[#18181b] border border-white/5 text-slate-400 hover:text-slate-200 font-medium rounded-lg text-xs transition-colors cursor-pointer"
                          >
                            Back
                          </button>
                        </div>
                      </div>

                      <div className="bg-black/40 p-4 border border-white/5 rounded-2xl flex items-center space-x-3">
                        <div className="w-2.5 h-2.5 bg-amber-500 rounded-full animate-ping"></div>
                        <p className="text-xs text-slate-400 leading-relaxed">
                          Keep this screen open. Connection will instantly open when the host scans this answer.
                        </p>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
