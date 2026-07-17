import React, { useRef } from "react";
import { ConnectionState, PeerIdentity } from "../types";
import { User, Laptop, Smartphone, HelpCircle } from "lucide-react";

interface RadarProps {
  myIdentity: PeerIdentity;
  peerIdentity: PeerIdentity | null;
  connectionState: ConnectionState;
  onFileSelect: (file: File) => void;
}

export default function Radar({
  myIdentity,
  peerIdentity,
  connectionState,
  onFileSelect,
}: RadarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleNodeClick = () => {
    if (connectionState === "connected" && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  };

  // Helper to determine device icon/avatar
  const getAvatarGradient = (color: string) => {
    switch (color) {
      case "blue":
        return "bg-gradient-to-tr from-blue-600 to-indigo-600 shadow-blue-500/20";
      case "purple":
        return "bg-gradient-to-tr from-purple-500 to-indigo-500 shadow-purple-500/20";
      case "pink":
        return "bg-gradient-to-tr from-pink-500 to-rose-500 shadow-pink-500/20";
      case "amber":
        return "bg-gradient-to-tr from-amber-500 to-orange-500 shadow-amber-500/20";
      default:
        return "bg-gradient-to-tr from-slate-600 to-slate-800 shadow-slate-500/20";
    }
  };

  return (
    <div className="relative flex-1 flex flex-col items-center justify-center overflow-hidden w-full h-full p-4">
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Pulsing Concentric Radar Rings */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {/* Radar Ring 1 */}
        <div className="absolute w-[200px] h-[200px] rounded-full border border-blue-500/10 flex items-center justify-center">
          {connectionState !== "connected" && (
            <div className="absolute inset-0 rounded-full border border-blue-400/40 animate-radar-wave"></div>
          )}
        </div>
        {/* Radar Ring 2 */}
        <div className="absolute w-[360px] h-[360px] rounded-full border border-white/5 flex items-center justify-center">
          {connectionState !== "connected" && (
            <div className="absolute inset-0 rounded-full border border-blue-400/20 animate-radar-wave [animation-delay:1.5s]"></div>
          )}
        </div>
        {/* Radar Ring 3 */}
        <div className="absolute w-[520px] h-[520px] rounded-full border border-white/5 flex items-center justify-center">
          {connectionState !== "connected" && (
            <div className="absolute inset-0 rounded-full border border-indigo-400/15 animate-radar-wave [animation-delay:3s]"></div>
          )}
        </div>
      </div>

      {/* Central Self Node & Peer Node Coordinates */}
      <div className="relative w-[500px] h-[500px] flex items-center justify-center">
        
        {/* CENTER SELF NODE */}
        <div className="absolute z-10 flex flex-col items-center space-y-2">
          <div className={`w-18 h-18 rounded-full ${getAvatarGradient(myIdentity.color)} flex items-center justify-center shadow-lg border border-white/10 glow-blue`}>
            <span className="text-2xl">{myIdentity.avatar}</span>
          </div>
          <div className="text-center">
            <span className="text-xs font-semibold bg-slate-950/80 border border-white/5 px-2.5 py-1 rounded-full text-blue-400">
              You ({myIdentity.name})
            </span>
          </div>
        </div>

        {/* CONNECTED PEER NODE (Renders offset floating in orbit) */}
        {connectionState === "connected" && peerIdentity && (
          <button
            onClick={handleNodeClick}
            className="absolute top-[18%] left-[62%] z-20 flex flex-col items-center space-y-2 group cursor-pointer transition-transform hover:scale-105 active:scale-95 animate-fade-in"
          >
            {/* Pulsing signal glow around peer */}
            <div className="absolute -inset-2 rounded-full bg-indigo-500/20 animate-ping opacity-70"></div>
            
            <div className={`w-16 h-16 rounded-full ${getAvatarGradient(peerIdentity.color)} flex items-center justify-center shadow-xl border border-white/15 relative glow-indigo transition-shadow group-hover:shadow-indigo-500/40`}>
              <span className="text-xl">{peerIdentity.avatar}</span>
              {/* Connected Active Dot */}
              <div className="absolute bottom-0 right-0 w-4 h-4 bg-emerald-500 rounded-full border-2 border-slate-900 flex items-center justify-center">
                <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></div>
              </div>
            </div>

            <div className="text-center space-y-0.5">
              <div className="text-xs font-semibold bg-slate-950/80 border border-white/5 px-3 py-1 rounded-full text-slate-100 flex items-center space-x-1.5 shadow-md">
                <span>{peerIdentity.name}</span>
              </div>
              <p className="text-[10px] text-blue-400 font-medium opacity-80 animate-pulse">
                Click to send file
              </p>
            </div>
          </button>
        )}

        {/* CONNECTING LOADER ORBIT */}
        {connectionState === "connecting" && (
          <div className="absolute top-[18%] left-[62%] z-20 flex flex-col items-center space-y-2 animate-pulse">
            <div className="w-16 h-16 rounded-full bg-slate-800 border-2 border-dashed border-blue-500/50 flex items-center justify-center animate-[spin_10s_linear_infinite]">
              <HelpCircle className="w-6 h-6 text-blue-500/40" />
            </div>
            <div className="text-xs font-medium text-blue-400 bg-slate-950/80 border border-white/5 px-2 py-0.5 rounded-full">
              Linking...
            </div>
          </div>
        )}
      </div>

      {/* Connection Indicator text */}
      <div className="absolute bottom-28 sm:bottom-32 flex flex-col items-center space-y-1.5 pointer-events-none text-center px-4">
        {connectionState === "connected" && peerIdentity ? (
          <>
            <p className="text-xs font-medium text-slate-300">
              Connected with <span className="text-indigo-400">{peerIdentity.name}</span>
            </p>
            <p className="text-[10px] text-slate-500 max-w-xs">
              Tap the node above to share files, or use the panel below to send messages.
            </p>
          </>
        ) : (
          <>
            <p className="text-xs font-medium text-slate-400 animate-pulse">
              {connectionState === "connecting" ? "Handshaking..." : "Looking for devices..."}
            </p>
            <p className="text-[10px] text-slate-500 max-w-xs leading-normal">
              No devices paired yet. Click the "Pair Device" button to start a connection group.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
