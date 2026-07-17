import React, { useState, useEffect, useRef } from "react";
import { PeerIdentity, ConnectionState, TransferState, TextMessage } from "./types";
import Radar from "./components/Radar";
import TextChat from "./components/TextChat";
import FileTransferModal from "./components/FileTransferModal";
import ManualConnectionModal from "./components/ManualConnectionModal";
import { Wifi, WifiOff, Settings, Edit3, Check, RefreshCw, Smartphone, Laptop, Plus } from "lucide-react";

// Adjectives and Animals for automatic, cute peer name generation
const ADJECTIVES = ["Swift", "Golden", "Midnight", "Frosty", "Emerald", "Neon", "Crimson", "Amber"];
const ANIMALS = ["Dolphin", "Eagle", "Owl", "Fox", "Cobra", "Panther", "Tiger", "Koala"];
const EMOJIS = ["🐬", "🦅", "🦉", "🦊", "🐍", "🐆", "🐅", "🐨"];
const COLORS = ["blue", "purple", "pink", "amber"];

const getRandomIdentity = (): PeerIdentity => {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  const idx = Math.floor(Math.random() * EMOJIS.length);
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  return {
    name: `${adj} ${animal}`,
    avatar: EMOJIS[idx],
    color: color,
  };
};

export default function App() {
  // --- STATE ---
  const [myIdentity, setMyIdentity] = useState<PeerIdentity>(() => {
    const saved = localStorage.getItem("offline_p2p_identity");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // Fallback
      }
    }
    const ident = getRandomIdentity();
    localStorage.setItem("offline_p2p_identity", JSON.stringify(ident));
    return ident;
  });

  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameVal, setEditNameVal] = useState(myIdentity.name);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // Connection & Peer State
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [peerIdentity, setPeerIdentity] = useState<PeerIdentity | null>(null);
  const [connectorOpen, setConnectorOpen] = useState(false);

  // Chat State
  const [messages, setMessages] = useState<TextMessage[]>([]);

  // File Transfer State
  const [activeTransfer, setActiveTransfer] = useState<TransferState | null>(null);
  const [incomingRequest, setIncomingRequest] = useState<{ name: string; size: number; mimeType: string } | null>(null);

  // --- WEBRTC REFS ---
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);

  // File Sender/Receiver Buffers & Progress Refs
  const activeFileRef = useRef<File | null>(null);
  const receivedChunksRef = useRef<ArrayBuffer[]>([]);
  const receivedBytesRef = useRef<number>(0);
  const transferTimerRef = useRef<any>(null);
  const startTimeRef = useRef<number>(0);
  const incomingFileMetaRef = useRef<{ name: string; size: number; mimeType: string } | null>(null);
  const lastMessageTimeRef = useRef<number>(0);

  // Handle browser online/offline indicators
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Screen Wake Lock to prevent phone from sleeping during active connection
  const wakeLockRef = useRef<any>(null);

  useEffect(() => {
    const requestWakeLock = async () => {
      if (!("wakeLock" in navigator) || connectionState !== "connected" || wakeLockRef.current) return;
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
        console.log("Wake Lock active - screen won't sleep.");
        
        wakeLockRef.current.addEventListener("release", () => {
          wakeLockRef.current = null;
          console.log("Wake Lock was released by system.");
        });
      } catch (err) {
        console.warn("Screen Wake Lock failed:", err);
      }
    };

    const releaseWakeLock = async () => {
      if (wakeLockRef.current) {
        try {
          await wakeLockRef.current.release();
        } catch (e) {}
        wakeLockRef.current = null;
        console.log("Wake Lock released.");
      }
    };

    if (connectionState === "connected") {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }

    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible" && connectionState === "connected") {
        await requestWakeLock();
      }
    };

    // User gesture listener to overcome browser safety restrictions
    const handleUserGesture = () => {
      if (connectionState === "connected" && !wakeLockRef.current) {
        requestWakeLock();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("click", handleUserGesture);
    document.addEventListener("touchstart", handleUserGesture);

    return () => {
      releaseWakeLock();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("click", handleUserGesture);
      document.removeEventListener("touchstart", handleUserGesture);
    };
  }, [connectionState]);

  // WebRTC Heartbeat (Ping/Pong) to instantly detect silent disconnects (e.g. mobile sleep)
  useEffect(() => {
    if (connectionState !== "connected" || !dcRef.current) return;

    lastMessageTimeRef.current = Date.now();
    
    const interval = setInterval(() => {
      const channel = dcRef.current;
      if (!channel || channel.readyState !== "open") {
        console.log("Heartbeat: DataChannel is not open, disconnecting.");
        handleDisconnect();
        return;
      }

      // Send ping
      try {
        channel.send(JSON.stringify({ type: "ping" }));
      } catch (err) {
        console.warn("Heartbeat ping send failed:", err);
        handleDisconnect();
        return;
      }

      // Check timeout (if no message received for more than 7 seconds, disconnect)
      const silenceDuration = Date.now() - lastMessageTimeRef.current;
      if (silenceDuration > 7000) {
        console.warn(`Heartbeat timeout: No peer response for ${Math.round(silenceDuration)}ms. Disconnecting.`);
        handleDisconnect();
      }
    }, 2500);

    return () => {
      clearInterval(interval);
    };
  }, [connectionState]);

  // Save Identity changes
  const handleSaveName = () => {
    if (editNameVal.trim()) {
      const updated = { ...myIdentity, name: editNameVal.trim() };
      setMyIdentity(updated);
      localStorage.setItem("offline_p2p_identity", JSON.stringify(updated));
      setIsEditingName(false);

      // Notify peer if connected
      if (connectionState === "connected" && dcRef.current && dcRef.current.readyState === "open") {
        dcRef.current.send(
          JSON.stringify({
            type: "handshake",
            name: updated.name,
            avatar: updated.avatar,
            color: updated.color,
          })
        );
      }
    }
  };

  const handleAvatarRoll = () => {
    const idx = Math.floor(Math.random() * EMOJIS.length);
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const updated = { ...myIdentity, avatar: EMOJIS[idx], color };
    setMyIdentity(updated);
    setEditNameVal(updated.name);
    localStorage.setItem("offline_p2p_identity", JSON.stringify(updated));

    // Notify peer if connected
    if (connectionState === "connected" && dcRef.current && dcRef.current.readyState === "open") {
      dcRef.current.send(
        JSON.stringify({
          type: "handshake",
          name: updated.name,
          avatar: updated.avatar,
          color: updated.color,
        })
      );
    }
  };

  // --- WEBRTC CHANNEL MANAGEMENT ---

  const setupDataChannel = (channel: RTCDataChannel) => {
    dcRef.current = channel;
    channel.binaryType = "arraybuffer";

    channel.onopen = () => {
      console.log("WebRTC Data Channel Opened!");
      setConnectionState("connected");
      // Instant handshake to share credentials
      channel.send(
        JSON.stringify({
          type: "handshake",
          name: myIdentity.name,
          avatar: myIdentity.avatar,
          color: myIdentity.color,
        })
      );
    };

    channel.onclose = () => {
      console.log("WebRTC Data Channel Closed.");
      handleDisconnect();
    };

    channel.onerror = (err) => {
      console.error("WebRTC Data Channel Error:", err);
      // Log errors but avoid calling handleDisconnect() on write-burst warnings. 
      // actual connection losses are caught reliably by onclose, connectionState shifts, and heartbeat.
    };

    channel.onmessage = (event) => {
      handleChannelMessage(event.data);
    };
  };

  const handleDisconnect = () => {
    setConnectionState("disconnected");
    setPeerIdentity(null);
    setActiveTransfer(null);
    setIncomingRequest(null);
    incomingFileMetaRef.current = null;
    lastMessageTimeRef.current = 0;
    // Cleanup connection
    if (dcRef.current) {
      try {
        dcRef.current.close();
      } catch (e) {}
      dcRef.current = null;
    }
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch (e) {}
      pcRef.current = null;
    }
    cleanupTransferTimer();
  };

  // --- INCOMING MESSAGES ROUTER ---

  const handleChannelMessage = (data: any) => {
    // Record message timestamp for keep-alive check
    lastMessageTimeRef.current = Date.now();

    // 1. Binary Data: File Chunks (could be ArrayBuffer or Blob depending on browser/framework)
    if (data instanceof ArrayBuffer || data instanceof Blob) {
      const byteLength = data instanceof ArrayBuffer ? data.byteLength : data.size;
      receivedChunksRef.current.push(data);
      receivedBytesRef.current += byteLength;
      
      const incomingMeta = incomingFileMetaRef.current;
      if (incomingMeta) {
        const totalSize = incomingMeta.size;
        const currentBytes = receivedBytesRef.current;
        const progress = Math.min(100, (currentBytes / totalSize) * 100);

        // Update Transfer Stats
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        const speed = elapsed > 0 ? (currentBytes / 1024) / elapsed : 0; // KB/s

        setActiveTransfer({
          name: incomingMeta.name,
          size: totalSize,
          progress,
          type: "receive",
          speed,
          elapsed,
          bytesTransferred: currentBytes,
        });
      }
      return;
    }

    // 2. Control Messages: JSON Strings
    try {
      const msg = JSON.parse(data);
      switch (msg.type) {
        case "ping":
          // Reply with pong
          if (dcRef.current && dcRef.current.readyState === "open") {
            try {
              dcRef.current.send(JSON.stringify({ type: "pong" }));
            } catch (e) {}
          }
          break;

        case "pong":
          // Handled by updating lastMessageTimeRef.current at top of function
          break;

        case "handshake":
          setPeerIdentity({
            name: msg.name,
            avatar: msg.avatar,
            color: msg.color,
          });
          break;

        case "text":
          setMessages((prev) => [
            ...prev,
            {
              id: msg.id,
              text: msg.text,
              sender: "peer",
              timestamp: msg.timestamp,
            },
          ]);
          break;

        case "file-request":
          // Open incoming file accept dialog
          incomingFileMetaRef.current = {
            name: msg.name,
            size: msg.size,
            mimeType: msg.mimeType,
          };
          setIncomingRequest({
            name: msg.name,
            size: msg.size,
            mimeType: msg.mimeType,
          });
          break;

        case "file-accepted":
          // Receiver accepted! Start slice sending loop
          startTransmittingFile();
          break;

        case "file-declined":
          alert("Peer declined the file transfer.");
          setActiveTransfer(null);
          activeFileRef.current = null;
          break;

        case "file-complete":
          // Receive finished: Compile Blob and Download
          completeIncomingTransfer();
          break;

        case "transfer-cancel":
          alert("Transfer was canceled by the peer.");
          resetTransferState();
          break;
      }
    } catch (err) {
      console.error("Failed to parse string channel message:", err);
    }
  };

  // --- MANUAL SIGNALING ENGINE ---

  // Host: Prepare local SDP Offer & gather all candidates
  const handleHostInit = async (onOfferReady: (offerStr: string) => void) => {
    handleDisconnect(); // close old ones
    setConnectionState("connecting");

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
      ]
    });
    pcRef.current = pc;

    // Host creates the channel
    const dc = pc.createDataChannel("share-channel", { ordered: true });
    setupDataChannel(dc);

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "failed" || pc.iceConnectionState === "closed") {
        handleDisconnect();
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed" || pc.connectionState === "closed") {
        handleDisconnect();
      }
    };

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Wait for host ICE gathering to complete before returning
      if (pc.iceGatheringState === "complete") {
        onOfferReady(JSON.stringify(pc.localDescription));
      } else {
        pc.onicecandidate = (event) => {
          if (event.candidate === null) {
            onOfferReady(JSON.stringify(pc.localDescription));
          }
        };
      }
    } catch (err) {
      console.error("Error creating WebRTC Offer:", err);
      handleDisconnect();
    }
  };

  // Joiner: Accept Offer, produce local SDP Answer
  const handleJoinOffer = async (offerStr: string, onAnswerReady: (answerStr: string) => void) => {
    handleDisconnect();
    setConnectionState("connecting");

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
      ]
    });
    pcRef.current = pc;

    // Joiner listens for data channel trigger
    pc.ondatachannel = (event) => {
      setupDataChannel(event.channel);
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "failed" || pc.iceConnectionState === "closed") {
        handleDisconnect();
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed" || pc.connectionState === "closed") {
        handleDisconnect();
      }
    };

    try {
      const offerDesc = JSON.parse(offerStr);
      await pc.setRemoteDescription(new RTCSessionDescription(offerDesc));

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // Wait for answer ICE gathering to complete
      if (pc.iceGatheringState === "complete") {
        onAnswerReady(JSON.stringify(pc.localDescription));
      } else {
        pc.onicecandidate = (event) => {
          if (event.candidate === null) {
            onAnswerReady(JSON.stringify(pc.localDescription));
          }
        };
      }
    } catch (err) {
      console.error("Error setting Remote Offer / creating Answer:", err);
      alert("Invalid Connection payload. Please reset and try scanning again.");
      handleDisconnect();
    }
  };

  // Host: Complete with local SDP Answer from Peer
  const handleHostComplete = async (answerStr: string) => {
    if (!pcRef.current) return;
    try {
      const answerDesc = JSON.parse(answerStr);
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(answerDesc));
      console.log("Remote SDP Answer Set! Peer connection should open...");
    } catch (err) {
      console.error("Error finalizing remote answer on Host:", err);
      alert("Invalid peer answer connection string. Please try again.");
      handleDisconnect();
    }
  };

  // --- TEXT SHARING ENGINE ---

  const handleSendMessage = (text: string) => {
    if (!dcRef.current || dcRef.current.readyState !== "open") return;

    const payload = {
      id: Math.random().toString(36).substring(7),
      text,
      sender: "me",
      timestamp: Date.now(),
    };

    dcRef.current.send(JSON.stringify({
      type: "text",
      id: payload.id,
      text: payload.text,
      timestamp: payload.timestamp
    }));

    // Local append
    setMessages((prev) => [
      ...prev,
      {
        id: payload.id,
        text: payload.text,
        sender: "me",
        timestamp: payload.timestamp,
      },
    ]);
  };

  // --- FILE TRANSFER & CHUNKING ENGINE ---

  // Triggered when a file is selected on the Radar Node
  const handleFileSelectedForPeer = (file: File) => {
    if (!dcRef.current || dcRef.current.readyState !== "open" || !peerIdentity) return;

    activeFileRef.current = file;

    // Set sending state (un-accepted yet)
    setActiveTransfer({
      name: file.name,
      size: file.size,
      progress: 0,
      type: "send",
      speed: 0,
      elapsed: 0,
      bytesTransferred: 0,
    });

    // Send transaction request
    dcRef.current.send(
      JSON.stringify({
        type: "file-request",
        name: file.name,
        size: file.size,
        mimeType: file.type,
      })
    );
  };

  // Receiver actions
  const handleAcceptIncomingFile = () => {
    const request = incomingFileMetaRef.current || incomingRequest;
    if (!dcRef.current || !request) return;

    // Ensure incomingFileMetaRef.current is populated synchronously
    incomingFileMetaRef.current = request;

    // Initialize reception buffer
    receivedChunksRef.current = [];
    receivedBytesRef.current = 0;
    startTimeRef.current = Date.now();

    // Enter receiving state
    setActiveTransfer({
      name: request.name,
      size: request.size,
      progress: 0,
      type: "receive",
      speed: 0,
      elapsed: 0,
      bytesTransferred: 0,
    });

    // Notify sender we are ready!
    dcRef.current.send(JSON.stringify({ type: "file-accepted" }));
    setIncomingRequest(null); // clear request popover
  };

  const handleDeclineIncomingFile = () => {
    if (!dcRef.current) return;
    dcRef.current.send(JSON.stringify({ type: "file-declined" }));
    setIncomingRequest(null);
    incomingFileMetaRef.current = null;
  };

  // Sender starts splitting file into chunks
  const startTransmittingFile = () => {
    const file = activeFileRef.current;
    const channel = dcRef.current;
    if (!file || !channel || channel.readyState !== "open") return;

    const CHUNK_SIZE = 16384; // 16KB standard safe WebRTC slice size
    let offset = 0;
    const threshold = 65536; // 64KB threshold for low-buffer throttling
    channel.bufferedAmountLowThreshold = threshold;

    startTimeRef.current = Date.now();

    const readSlice = (currentOffset: number) => {
      if (!activeFileRef.current) return; // cancelled midway

      const slice = file.slice(currentOffset, currentOffset + CHUNK_SIZE);
      const reader = new FileReader();

      reader.onload = (event) => {
        const buffer = event.target?.result as ArrayBuffer;
        if (!buffer || channel.readyState !== "open") return;

        try {
          channel.send(buffer);
        } catch (sendErr) {
          console.error("Failed to send binary slice via DataChannel:", sendErr);
          alert("File transmission failed due to a channel write error.");
          handleCancelTransfer();
          return;
        }

        offset += buffer.byteLength;

        // Calculate progress stats
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        const speed = elapsed > 0 ? (offset / 1024) / elapsed : 0; // KB/s
        const progress = Math.min(100, (offset / file.size) * 100);

        setActiveTransfer({
          name: file.name,
          size: file.size,
          progress,
          type: "send",
          speed,
          elapsed,
          bytesTransferred: offset,
        });

        if (offset < file.size) {
          // Keep sending, throttle if buffers are packed
          if (channel.bufferedAmount > threshold) {
            let lowCalled = false;
            channel.onbufferedamountlow = () => {
              if (lowCalled) return;
              lowCalled = true;
              channel.onbufferedamountlow = null;
              readSlice(offset);
            };
            // Fallback timer if onbufferedamountlow fails to fire
            setTimeout(() => {
              if (!lowCalled) {
                lowCalled = true;
                channel.onbufferedamountlow = null;
                readSlice(offset);
              }
            }, 100);
          } else {
            // Slight delay (5ms) to give the event loop and WebRTC engine time to breathe
            setTimeout(() => readSlice(offset), 5);
          }
        } else {
          // Completed sending!
          try {
            channel.send(JSON.stringify({ type: "file-complete" }));
          } catch (e) {
            console.error("Error sending file-complete signal:", e);
          }
          setTimeout(() => {
            alert("File sent successfully!");
            resetTransferState();
          }, 300);
        }
      };

      reader.readAsArrayBuffer(slice);
    };

    readSlice(0);
  };

  // Receiver finishes reassembling
  const completeIncomingTransfer = () => {
    const meta = incomingFileMetaRef.current;
    if (!meta || receivedChunksRef.current.length === 0) return;

    const compiledBlob = new Blob(receivedChunksRef.current, { type: meta.mimeType || "application/octet-stream" });
    const downloadUrl = URL.createObjectURL(compiledBlob);

    // Native trigger download
    const linkNode = document.createElement("a");
    linkNode.href = downloadUrl;
    linkNode.download = meta.name;
    document.body.appendChild(linkNode);
    linkNode.click();
    document.body.removeChild(linkNode);

    // Cleanup resources
    URL.revokeObjectURL(downloadUrl);
    setTimeout(() => {
      alert(`Successfully downloaded file: ${meta.name}`);
      resetTransferState();
    }, 300);
  };

  // Cancel any active transfer
  const handleCancelTransfer = () => {
    if (dcRef.current) {
      dcRef.current.send(JSON.stringify({ type: "transfer-cancel" }));
    }
    resetTransferState();
  };

  const resetTransferState = () => {
    setActiveTransfer(null);
    setIncomingRequest(null);
    incomingFileMetaRef.current = null;
    activeFileRef.current = null;
    receivedChunksRef.current = [];
    receivedBytesRef.current = 0;
  };

  const cleanupTransferTimer = () => {
    if (transferTimerRef.current) {
      clearInterval(transferTimerRef.current);
      transferTimerRef.current = null;
    }
  };

  // UI Helper
  const getIdentityColorClass = (color: string) => {
    switch (color) {
      case "blue": return "text-blue-400 border-blue-500/20 bg-blue-500/5";
      case "purple": return "text-indigo-400 border-indigo-500/20 bg-indigo-500/5";
      case "pink": return "text-pink-400 border-pink-500/20 bg-pink-500/5";
      case "amber": return "text-amber-400 border-amber-500/20 bg-amber-500/5";
      default: return "text-slate-400 border-slate-500/20 bg-slate-500/5";
    }
  };

  return (
    <div className="flex flex-col h-[100dvh] w-screen bg-[#0a0a0b] text-slate-200 overflow-hidden font-sans relative">
      {/* HEADER SECTION */}
      <header className="flex items-center justify-between px-8 py-5 border-b border-white/5 bg-[#0a0a0b]/80 backdrop-blur-md z-30">
        
        {/* User Identity Info / Customizable Profile */}
        <div className="flex items-center space-x-3 max-w-[50%]">
          <button
            onClick={handleAvatarRoll}
            className="w-10 h-10 rounded-xl bg-[#18181b] border border-white/10 hover:border-white/20 hover:scale-105 active:scale-95 flex items-center justify-center text-lg shadow-inner cursor-pointer transition-all"
            title="Roll Avatar Emoji"
          >
            {myIdentity.avatar}
          </button>

          {isEditingName ? (
            <div className="flex items-center space-x-1.5 animate-fade-in">
              <input
                type="text"
                value={editNameVal}
                onChange={(e) => setEditNameVal(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                className="bg-[#18181b] border border-blue-500/40 rounded-lg px-2 py-1 text-xs text-slate-100 focus:outline-none w-28 sm:w-36 font-mono font-medium"
                maxLength={18}
                autoFocus
              />
              <button
                onClick={handleSaveName}
                className="p-1 bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-colors cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center space-x-2 truncate">
              <span className="font-semibold text-sm text-slate-100 truncate tracking-tight">
                {myIdentity.name}
              </span>
              <button
                onClick={() => {
                  setEditNameVal(myIdentity.name);
                  setIsEditingName(true);
                }}
                className="p-1 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Title Logo Accent */}
        <div className="hidden md:flex flex-col items-center select-none pointer-events-none">
          <h1 className="text-sm font-bold tracking-widest text-slate-100 uppercase flex items-center space-x-1.5">
            <span className="text-blue-500">Offline</span>
            <span>P2P Share</span>
          </h1>
          <p className="text-[9px] text-slate-500 font-mono tracking-widest uppercase">zero-internet beam</p>
        </div>

        {/* Action Triggers */}
        <div className="flex items-center space-x-3.5">
          {/* Offline/Online indicators */}
          <div className="flex items-center space-x-1.5 px-3 py-1 bg-white/5 border border-white/10 rounded-full">
            {isOffline ? (
              <>
                <WifiOff className="w-3 h-3 text-amber-500 animate-pulse" />
                <span className="text-[10px] font-mono font-bold text-amber-500">OFFLINE READY</span>
              </>
            ) : (
              <>
                <Wifi className="w-3 h-3 text-emerald-500" />
                <span className="text-[10px] font-mono font-bold text-emerald-500">LOCAL LAN</span>
              </>
            )}
          </div>

          {/* Pair Button */}
          <button
            onClick={() => setConnectorOpen(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-semibold rounded-full text-xs flex items-center space-x-1.5 transition-all cursor-pointer shadow-lg shadow-blue-500/10 border border-white/10"
          >
            <Plus className="w-3.5 h-3.5 stroke-[3]" />
            <span>Pair Device</span>
          </button>
        </div>
      </header>

      {/* CORE RADAR & PEERS CONTAINER */}
      <main className="flex-1 w-full relative flex flex-col overflow-hidden pb-36">
        <Radar
          myIdentity={myIdentity}
          peerIdentity={peerIdentity}
          connectionState={connectionState}
          onFileSelect={handleFileSelectedForPeer}
        />
      </main>

      {/* BOTTOM SLIDING CHAT & CLINICAL SNIPPETS BEAM */}
      <TextChat
        messages={messages}
        onSendMessage={handleSendMessage}
        connectionState={connectionState}
      />

      {/* PAIRING MANUAL SIGNALING CONNECTOR MODAL */}
      {connectorOpen && (
        <ManualConnectionModal
          connectionState={connectionState}
          onClose={() => setConnectorOpen(false)}
          onHostInit={handleHostInit}
          onJoinOffer={handleJoinOffer}
          onHostComplete={handleHostComplete}
        />
      )}

      {/* INCOMING & ACTIVE FILE TRANSFER HANDLER MODAL */}
      <FileTransferModal
        transferState={activeTransfer}
        incomingRequest={incomingRequest}
        onAccept={handleAcceptIncomingFile}
        onDecline={handleDeclineIncomingFile}
        onCancel={handleCancelTransfer}
        peerName={peerIdentity?.name || "Peer"}
      />
    </div>
  );
}
