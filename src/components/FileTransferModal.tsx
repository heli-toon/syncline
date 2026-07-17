import React from "react";
import { TransferState } from "../types";
import { FileUp, FileDown, CheckCircle2, AlertTriangle, X } from "lucide-react";

interface FileTransferModalProps {
  transferState: TransferState | null;
  incomingRequest: { name: string; size: number; mimeType: string } | null;
  onAccept: () => void;
  onDecline: () => void;
  onCancel: () => void;
  peerName: string;
}

export default function FileTransferModal({
  transferState,
  incomingRequest,
  onAccept,
  onDecline,
  onCancel,
  peerName,
}: FileTransferModalProps) {
  
  // Format File Size
  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Format Speed (KB/s or MB/s)
  const formatSpeed = (kbps: number) => {
    if (kbps < 1024) {
      return `${kbps.toFixed(1)} KB/s`;
    }
    return `${(kbps / 1024).toFixed(1)} MB/s`;
  };

  if (incomingRequest) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-fade-in">
        <div className="w-full max-w-sm bg-[#0a0a0b]/95 border border-white/5 rounded-3xl p-6 shadow-2xl space-y-6 text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20 text-blue-400 animate-bounce">
            <FileDown className="w-7 h-7" />
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold text-slate-100 text-lg">Incoming File Request</h3>
            <p className="text-xs text-slate-400">
              <span className="text-blue-400 font-medium">{peerName}</span> wants to send you a file:
            </p>
            <div className="bg-black/60 p-3 rounded-xl border border-white/5 mt-1 max-w-xs mx-auto">
              <p className="text-xs font-mono font-medium text-slate-200 break-all">{incomingRequest.name}</p>
              <p className="text-[10px] text-slate-500 font-mono mt-1">{formatSize(incomingRequest.size)}</p>
            </div>
          </div>

          <div className="flex space-x-3 pt-2">
            <button
              onClick={onDecline}
              className="flex-1 py-2.5 bg-[#18181b] border border-white/5 hover:bg-zinc-800 text-slate-400 font-medium rounded-xl text-sm transition-colors cursor-pointer"
            >
              Decline
            </button>
            <button
              onClick={onAccept}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl text-sm transition-all shadow-lg shadow-blue-500/20 cursor-pointer active:scale-[0.98]"
            >
              Accept File
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (transferState) {
    const { name, size, progress, type, speed, bytesTransferred } = transferState;
    const isSending = type === "send";

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-fade-in">
        <div className="w-full max-w-sm bg-[#0a0a0b]/95 border border-white/5 rounded-3xl p-6 shadow-2xl space-y-6 text-center">
          {/* Header Icon */}
          <div className="flex justify-center">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border ${
              isSending 
                ? "bg-blue-500/10 border-blue-500/20 text-blue-400"
                : "bg-indigo-500/10 border-indigo-500/20 text-indigo-400"
            }`}>
              {isSending ? (
                <FileUp className="w-7 h-7 animate-pulse" />
              ) : (
                <FileDown className="w-7 h-7 animate-pulse" />
              )}
            </div>
          </div>

          {/* Progress Circular Stage */}
          <div className="flex flex-col items-center justify-center relative">
            {/* SVG Circular Progress Bar */}
            <svg className="w-24 h-24 transform -rotate-90">
              <circle
                cx="48"
                cy="48"
                r="42"
                stroke="rgba(255, 255, 255, 0.05)"
                strokeWidth="6"
                fill="transparent"
              />
              <circle
                cx="48"
                cy="48"
                r="42"
                stroke={isSending ? "#3b82f6" : "#6366f1"}
                strokeWidth="6"
                fill="transparent"
                strokeDasharray="263.89"
                strokeDashoffset={263.89 - (263.89 * progress) / 100}
                className="transition-all duration-300 ease-out"
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className="text-lg font-mono font-bold text-slate-100">
                {Math.round(progress)}%
              </span>
              <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">
                {isSending ? "sending" : "receiving"}
              </span>
            </div>
          </div>

          {/* Details */}
          <div className="space-y-1">
            <p className="text-xs font-mono font-semibold text-slate-200 truncate max-w-[280px] mx-auto">
              {name}
            </p>
            <p className="text-[10px] text-slate-400 font-mono">
              {formatSize(bytesTransferred)} / {formatSize(size)}
            </p>
          </div>

          {/* Live Speed Stats Row */}
          <div className="grid grid-cols-2 gap-4 bg-black/60 p-3 rounded-xl border border-white/5 text-left">
            <div>
              <p className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold">Speed</p>
              <p className="text-xs font-mono font-medium text-slate-200 mt-0.5">
                {speed > 0 ? formatSpeed(speed) : "Calculating..."}
              </p>
            </div>
            <div>
              <p className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold">Time</p>
              <p className="text-xs font-mono font-medium text-slate-200 mt-0.5">
                {speed > 0 && progress < 100 ? (
                  `${Math.max(1, Math.round((size - bytesTransferred) / (speed * 1024)))}s remaining`
                ) : (
                  "Syncing..."
                )}
              </p>
            </div>
          </div>

          {/* Cancel button */}
          <button
            onClick={onCancel}
            className="w-full py-2.5 bg-[#18181b] border border-white/5 hover:bg-rose-500/10 hover:text-rose-400 text-slate-400 hover:border-rose-500/20 font-medium rounded-xl text-sm transition-all cursor-pointer flex items-center justify-center space-x-1"
          >
            <X className="w-4 h-4" />
            <span>Cancel Transfer</span>
          </button>
        </div>
      </div>
    );
  }

  return null;
}
