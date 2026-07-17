import React, { useState, useRef, useEffect } from "react";
import { TextMessage } from "../types";
import { Send, Clipboard, Copy, Check, MessageSquare, ChevronDown, ChevronUp, History } from "lucide-react";

interface TextChatProps {
  messages: TextMessage[];
  onSendMessage: (text: string) => void;
  connectionState: "disconnected" | "connecting" | "connected";
}

export default function TextChat({ messages, onSendMessage, connectionState }: TextChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [text, setText] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || connectionState !== "connected") return;
    onSendMessage(text.trim());
    setText("");
  };

  const handleCopy = (id: string, text: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text)
          .then(() => {
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), 1500);
          })
          .catch(() => {
            fallbackCopy(text, id);
          });
      } else {
        fallbackCopy(text, id);
      }
    } catch (e) {
      fallbackCopy(text, id);
    }
  };

  const fallbackCopy = (text: string, id: string) => {
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
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 1500);
      } else {
        console.error("Fallback copy failed");
      }
    } catch (err) {
      console.error("Fallback copy error:", err);
    }
    document.body.removeChild(textArea);
  };

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  const unreadCount = messages.length;

  return (
    <div className="absolute bottom-0 left-0 right-0 z-30 flex flex-col bg-[#0a0a0b]/90 border-t border-white/5 backdrop-blur-md transition-all duration-300 max-h-[80vh]">
      {/* Drawer Toggle Header / Collapsed Control */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center space-x-2 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer text-xs font-semibold uppercase tracking-wider"
        >
          {isOpen ? <ChevronDown className="w-4 h-4 text-blue-500" /> : <ChevronUp className="w-4 h-4 text-blue-500" />}
          <span>Instant Text Beam</span>
          {messages.length > 0 && (
            <span className="ml-1.5 px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-mono rounded-full">
              {messages.length} items
            </span>
          )}
        </button>

        <span className="text-[10px] text-slate-500 font-mono">
          {connectionState === "connected" ? "⚡ Channel Active" : "Channel Offline"}
        </span>
      </div>

      {/* Expanded History Panel */}
      {isOpen && (
        <div className="flex-1 flex flex-col p-4 bg-[#0a0a0b]/60 min-h-[220px] max-h-[350px]">
          <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pr-1 mb-3">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-4">
                <MessageSquare className="w-8 h-8 text-slate-700 mb-2" />
                <p className="text-xs text-slate-500 font-medium">No messages beamed yet</p>
                <p className="text-[10px] text-slate-600 max-w-[200px] mt-0.5 leading-normal">
                  Anything you type and beam below will appear here as a shareable snippet.
                </p>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col max-w-[85%] rounded-2xl p-3 shadow-md relative group transition-all duration-200 ${
                    msg.sender === "me"
                      ? "ml-auto bg-blue-600/10 border border-blue-500/20 text-slate-100"
                      : "mr-auto bg-[#18181b]/70 border border-white/5 text-slate-100"
                  }`}
                >
                  {/* Clip text */}
                  <p className="text-xs break-words font-mono whitespace-pre-wrap leading-relaxed select-text">
                    {msg.text}
                  </p>

                  {/* Actions & Meta */}
                  <div className="flex items-center justify-between mt-2.5 pt-1.5 border-t border-white/5">
                    <span className="text-[9px] text-slate-500 font-mono">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                    <button
                      onClick={() => handleCopy(msg.id, msg.text)}
                      className="p-1 bg-[#0a0a0b] hover:bg-[#18181b] text-slate-400 hover:text-blue-400 rounded-md transition-all active:scale-90"
                      title="Copy to clipboard"
                    >
                      {copiedId === msg.id ? <Check className="w-3.5 h-3.5 text-blue-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Main Single-Line Beam Form */}
      <form onSubmit={handleSubmit} className="flex p-4 bg-[#0a0a0b] border-t border-white/5 space-x-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={connectionState !== "connected"}
          placeholder={
            connectionState === "connected"
              ? "Type text or paste link to beam..."
              : "Waiting for peer to connect..."
          }
          className="flex-1 bg-[#18181b] border border-white/5 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all disabled:opacity-40"
        />
        <button
          type="submit"
          disabled={connectionState !== "connected" || !text.trim()}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-[#18181b] disabled:text-slate-600 disabled:border-white/5 text-white font-semibold rounded-xl text-sm transition-all active:scale-95 flex items-center justify-center space-x-1 border border-white/10 shadow-md shadow-blue-500/10 cursor-pointer"
        >
          <Send className="w-4 h-4" />
          <span className="hidden sm:inline">Beam</span>
        </button>
      </form>
    </div>
  );
}
