import React, { useRef, useState, useCallback } from 'react';
import Webcam from 'react-webcam';

interface CameraModalProps {
  onCapture: (base64: string) => void;
  onClose: () => void;
}

const CameraModal: React.FC<CameraModalProps> = ({ onCapture, onClose }) => {
  const webcamRef = useRef<Webcam>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');

  const capture = useCallback(() => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (imageSrc) {
      onCapture(imageSrc);
      onClose();
    }
  }, [webcamRef, onCapture, onClose]);

  const toggleFacingMode = () => {
    setFacingMode(prev => (prev === 'user' ? 'environment' : 'user'));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black animate-fade-in">
      <div className="relative w-full h-full flex flex-col items-center justify-center">
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 w-12 h-12 rounded-full bg-white/10 backdrop-blur-md text-white flex items-center justify-center hover:bg-white/20 transition-all z-10"
        >
          <i className="fas fa-times text-xl"></i>
        </button>

        {/* Webcam View */}
        <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden">
          <Webcam
            audio={false}
            ref={webcamRef}
            screenshotFormat="image/jpeg"
            className="w-full h-full object-cover sm:rounded-3xl shadow-2xl"
            videoConstraints={{
                facingMode: facingMode,
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            }}
            mirrored={false}
            imageSmoothing={true}
            forceScreenshotSourceSize={true}
            disablePictureInPicture={true}
            minScreenshotHeight={720}
            minScreenshotWidth={1280}
            id="field-camera"
            onUserMedia={() => console.log("Camera started")}
            onUserMediaError={(err) => console.error("Camera error", err)}
            screenshotQuality={0.9}
          />
          
          {/* Overlay Grid / Scan lines for "Tech" feel */}
          <div className="absolute inset-0 pointer-events-none border-x-4 border-y-[60px] border-black/40"></div>
        </div>

        {/* Controls */}
        <div className="absolute bottom-10 inset-x-0 flex items-center justify-center gap-12 sm:gap-20">
          {/* Toggle Camera */}
          <button 
            onClick={toggleFacingMode}
            className="w-14 h-14 rounded-full bg-white/10 backdrop-blur-md text-white flex items-center justify-center border border-white/20 hover:scale-110 active:scale-95 transition-all"
          >
            <i className="fas fa-sync-alt text-xl"></i>
          </button>

          {/* Shutter Button */}
          <button 
            onClick={capture}
            className="w-20 h-20 rounded-full bg-white p-1.5 shadow-xl hover:scale-110 active:scale-90 transition-all"
          >
            <div className="w-full h-full rounded-full border-4 border-brand-primary flex items-center justify-center">
               <div className="w-4 h-4 rounded-full bg-brand-primary/20"></div>
            </div>
          </button>

          {/* Upload Placeholder (to keep spacing balanced or another action) */}
          <div className="w-14 h-14 opacity-0 pointer-events-none"></div>
        </div>

        {/* Label */}
        <div className="absolute bottom-32 text-white/60 font-bold text-[10px] uppercase tracking-[0.3em]">
          Capturando {facingMode === 'environment' ? 'Entorno' : 'Selfie'}
        </div>
      </div>
    </div>
  );
};

export default CameraModal;
