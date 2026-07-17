import React, { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Camera, X, RefreshCw } from "lucide-react";

interface QRScannerProps {
  onScan: (data: string) => void;
  onClose: () => void;
}

export default function QRScanner({ onScan, onClose }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<number | null>(null);

  const startCamera = async () => {
    setLoading(true);
    setError(null);
    
    // Stop any existing streams first
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facingMode, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true"); // required for iOS
        videoRef.current.play();
      }
      
      setLoading(false);
      startScanning();
    } catch (err: any) {
      console.error("Camera access error:", err);
      setError("Unable to access camera. Please ensure permissions are granted or paste connection string manually.");
      setLoading(false);
    }
  };

  const startScanning = () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    const scan = () => {
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert",
        });

        if (code && code.data) {
          // Success! Found QR code
          onScan(code.data);
          cleanup();
          return;
        }
      }
      
      // Continue loop
      requestAnimationFrame(scan);
    };

    requestAnimationFrame(scan);
  };

  const toggleCamera = () => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  };

  const cleanup = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
  };

  useEffect(() => {
    startCamera();
    return () => {
      cleanup();
    };
  }, [facingMode]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95 p-4 animate-fade-in">
      <div className="relative w-full max-w-md bg-[#0a0a0b]/95 border border-white/5 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/5">
          <div className="flex items-center space-x-2">
            <Camera className="w-5 h-5 text-blue-400 animate-pulse" />
            <h3 className="font-semibold text-slate-100">Scan Invitation Code</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 bg-[#18181b] text-slate-400 hover:text-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Camera Stage */}
        <div className="relative flex-1 bg-black overflow-hidden flex items-center justify-center min-h-[300px]">
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center space-y-3 z-10 bg-slate-950">
              <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-sm text-slate-400">Warming up camera...</p>
            </div>
          )}

          {error ? (
            <div className="p-6 text-center max-w-xs space-y-4">
              <p className="text-sm text-rose-400">{error}</p>
              <button
                onClick={startCamera}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl text-sm transition-colors cursor-pointer"
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                playsInline
                muted
              />
              <canvas ref={canvasRef} className="hidden" />

              {/* QR Scan Overlay Target */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="relative w-64 h-64 border-2 border-dashed border-blue-400/70 rounded-3xl flex items-center justify-center">
                  <div className="absolute inset-0 border-4 border-blue-400 rounded-3xl animate-pulse opacity-20"></div>
                  <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-blue-400 rounded-tl-xl"></div>
                  <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-blue-400 rounded-tr-xl"></div>
                  <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-blue-400 rounded-bl-xl"></div>
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-blue-400 rounded-br-xl"></div>
                  
                  {/* Laser effect */}
                  <div className="absolute top-0 left-0 w-full h-0.5 bg-blue-400 opacity-80 shadow-[0_0_10px_rgba(59,130,246,1)] animate-[bounce_3s_infinite]"></div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer info/controls */}
        <div className="p-4 bg-black/60 border-t border-white/5 flex items-center justify-between">
          <p className="text-xs text-slate-400 max-w-[70%]">
            Center the other device's invitation QR code inside the frame to scan.
          </p>
          <button
            onClick={toggleCamera}
            className="p-2.5 bg-[#18181b] text-blue-400 hover:bg-zinc-800 hover:text-blue-300 rounded-xl transition-all active:scale-95 cursor-pointer"
            title="Switch Camera"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
