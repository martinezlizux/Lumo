import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  RotateCw, 
  FlipHorizontal, 
  Zap, 
  ZapOff, 
  Image as ImageIcon, 
  Eye, 
  Lock, 
  Unlock, 
  Maximize2
} from 'lucide-react';

// --- ESTILOS CSS INLINE PARA MÁXIMA PORTABILIDAD ---
const styles = `
  .ar-container {
    background-color: #000;
    color: #fff;
    font-family: 'Outfit', 'Inter', system-ui, sans-serif;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    position: relative;
  }
  .glass-panel {
    background: rgba(15, 15, 15, 0.6);
    backdrop-filter: blur(40px) saturate(180%);
    -webkit-backdrop-filter: blur(40px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 35px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  }
  .glass-button {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(10px);
    border-radius: 20px;
    padding: 14px;
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .glass-button:hover {
    background: rgba(255, 255, 255, 0.15);
    transform: translateY(-2px);
  }
  .glass-button:active {
    transform: scale(0.95);
  }
  .accent-blue { color: #60a5fa; }
  .accent-yellow { color: #facc15; }
  input[type="range"] {
    -webkit-appearance: none;
    width: 100%;
    height: 6px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 5px;
    outline: none;
  }
  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 20px;
    height: 20px;
    background: #fff;
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 0 15px rgba(0,0,0,0.5);
    transition: all 0.2s ease;
  }
  input[type="range"]:hover::-webkit-slider-thumb {
    transform: scale(1.2);
    background: #facc15;
  }
  .outline-mode {
    filter: grayscale(100%) contrast(500%) invert(100%) brightness(110%);
    mix-blend-mode: normal;
  }
  @keyframes pulse-slow {
    0%, 100% { opacity: 0.8; }
    50% { opacity: 0.4; }
  }
  .animate-pulse-slow {
    animation: pulse-slow 3s infinite;
  }
`;

/**
 * Hook para gestionar la cámara trasera y la linterna (torch).
 */
const useCamera = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startCamera = useCallback(async () => {
    setError(null); // Reset error on each retry
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("El navegador no permite acceso a la cámara. Asegúrate de estar usando HTTPS.");
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment', // Obliga a usar la cámara trasera
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });
      
      if (videoRef.current) videoRef.current.srcObject = mediaStream;
      setStream(mediaStream);
      
      const track = mediaStream.getVideoTracks()[0];
      const capabilities = track.getCapabilities() as any;
      setHasTorch(!!capabilities.torch);
    } catch (err: any) {
      console.error("Camera access failed:", err);
      setError(err.message || "No se pudo acceder a la cámara trasera.");
    }
  }, []);

  const toggleTorch = async () => {
    if (!stream || !hasTorch) return;
    const track = stream.getVideoTracks()[0];
    try {
      const newState = !isTorchOn;
      await (track as any).applyConstraints({ advanced: [{ torch: newState }] });
      setIsTorchOn(newState);
    } catch (err) { console.error("Torch control failed:", err); }
  };

  useEffect(() => {
    startCamera();
    return () => stream?.getTracks().forEach(t => t.stop());
  }, [startCamera]);

  return { videoRef, isTorchOn, hasTorch, toggleTorch, startCamera, error };
};

/**
 * Control del Wake Lock API para evitar que la pantalla se apague.
 */
const useWakeLock = () => {
  const [active, setActive] = useState(false);
  const sentinel = useRef<any>(null);

  const request = useCallback(async () => {
    if ('wakeLock' in navigator) {
      try {
        sentinel.current = await (navigator as any).wakeLock.request('screen');
        setActive(true);
        sentinel.current.onrelease = () => setActive(false);
      } catch (e) { console.error("WakeLock Error", e); }
    }
  }, []);

  useEffect(() => {
    request();
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && request());
  }, [request]);

  return active;
};

const ARTracer: React.FC = () => {
  const { videoRef, isTorchOn, hasTorch, toggleTorch, startCamera, error } = useCamera();
  const wakeLockActive = useWakeLock();

  // Estados de Imagen
  const [image, setImage] = useState<string | null>(null);
  const [opacity, setOpacity] = useState(0.5);
  const [rotation, setRotation] = useState(0);
  const [isMirrored, setIsMirrored] = useState(false);
  const [isOutlineMode, setIsOutlineMode] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [zoom, setZoom] = useState(1);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setImage(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="ar-container">
      <style>{styles}</style>

      {/* CÁMARA FULLSCREEN */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          filter: 'brightness(1.1)'
        }}
      />

      {/* IMAGEN DE CALCO (OVERLAY) */}
      <AnimatePresence>
        {image && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: opacity }}
            className="absolute inset-0 pointer-events-none flex items-center justify-center z-10"
          >
            <motion.img
              src={image}
              alt="Overlay"
              className={isOutlineMode ? 'outline-mode' : ''}
              style={{
                transform: `rotate(${rotation}deg) scaleX(${isMirrored ? -1 : 1}) scale(${zoom})`,
                maxWidth: '95%',
                maxHeight: '95%',
                objectFit: 'contain'
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* UI CAPA SUPERIOR (OVERLAY) */}
      <div className="absolute inset-0 z-40 p-6 pointer-events-none flex flex-col justify-between">
        
        {/* HEADER - TOP */}
        <div className="flex justify-between items-start w-full pointer-events-none">
          <div className="pointer-events-none">
            <h1 className="text-2xl font-black tracking-tighter" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
              LUMO <span style={{ color: '#facc15' }}>AR</span>
            </h1>
            <p style={{ fontSize: '9px', letterSpacing: '0.2em', opacity: 0.5, fontWeight: 'bold', textTransform: 'uppercase' }}>
              Tracer Edition Pro+
            </p>
          </div>

          {!isLocked && (
            <div className="flex gap-2 pointer-events-auto">
              {hasTorch && (
                <button onClick={toggleTorch} className="glass-button" style={{ 
                  background: isTorchOn ? '#facc15' : 'rgba(255,255,255,0.08)',
                  color: isTorchOn ? '#000' : '#fff',
                  boxShadow: isTorchOn ? '0 0 20px rgba(250,204,21,0.5)' : 'none'
                }}>
                  {isTorchOn ? <Zap size={22} fill="currentColor" /> : <ZapOff size={22} />}
                </button>
              )}
            </div>
          )}
        </div>

        {/* CONTROLES / GLASS PANEL - BOTTOM */}
        <AnimatePresence>
          {!isLocked ? (
            <motion.div 
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              className="glass-panel p-6 pointer-events-auto max-w-lg mx-auto w-full flex flex-col gap-6"
            >
              {/* Sliders Area */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <Eye size={18} opacity={0.6} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontWeight: 'bold', opacity: 0.5, marginBottom: '4px' }}>
                      <span>OPACIDAD</span>
                      <span>{Math.round(opacity * 100)}%</span>
                    </div>
                    <input type="range" min="0" max="1" step="0.01" value={opacity} onChange={e => setOpacity(parseFloat(e.target.value))} />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <Maximize2 size={18} opacity={0.6} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontWeight: 'bold', opacity: 0.5, marginBottom: '4px' }}>
                      <span>ZOOM</span>
                      <span>{zoom.toFixed(1)}x</span>
                    </div>
                    <input type="range" min="0.5" max="4" step="0.1" value={zoom} onChange={e => setZoom(parseFloat(e.target.value))} />
                  </div>
                </div>
              </div>

              {/* Toolbar Area */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <label className="glass-button" style={{ background: '#3b82f6', color: '#fff', border: 'none' }}>
                    <ImageIcon size={22} />
                    <input type="file" accept="image/*" onChange={handleUpload} style={{ display: 'none' }} />
                  </label>
                  <button onClick={() => setRotation(r => (r + 90) % 360)} className="glass-button">
                    <RotateCw size={22} />
                  </button>
                  <button onClick={() => setIsMirrored(!isMirrored)} className="glass-button" style={{ 
                    background: isMirrored ? '#fff' : 'rgba(255,255,255,0.08)',
                    color: isMirrored ? '#000' : '#fff'
                  }}>
                    <FlipHorizontal size={22} />
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => setIsOutlineMode(!isOutlineMode)} className="glass-button" style={{ 
                    background: isOutlineMode ? '#facc15' : 'rgba(255,255,255,0.08)',
                    color: isOutlineMode ? '#000' : '#fff',
                    fontWeight: '900', fontSize: '10px'
                  }}>
                    CONTORNO
                  </button>
                  <button onClick={() => setIsLocked(true)} className="glass-button" style={{ background: '#fff', color: '#000' }}>
                    <Unlock size={22} strokeWidth={3} />
                  </button>
                </div>
              </div>

              {/* Footer info */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '5px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: wakeLockActive ? '#22c55e' : '#f59e0b' }} className="animate-pulse-slow" />
                  <span style={{ fontSize: '8px', fontWeight: 'bold', opacity: 0.4 }}>{wakeLockActive ? 'WAKE LOCK ACTIVE' : 'WAKE LOCK UNAVAILABLE'}</span>
                </div>
                {error && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <p style={{ color: '#ef4444', fontSize: '8px', fontWeight: 'bold' }}>ERROR: {error}</p>
                    <button 
                      onClick={() => {
                        startCamera();
                      }}
                      style={{ 
                        background: '#ef4444', color: '#fff', border: 'none', 
                        borderRadius: '4px', padding: '4px 8px', fontSize: '8px', 
                        fontWeight: 'bold', cursor: 'pointer', pointerEvents: 'auto'
                      }}
                    >
                      REINTENTAR ACCESO
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            /* LOCK MODE OVERLAY */
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="fixed inset-0 z-[100] bg-black/10 flex flex-col items-center justify-center gap-6 pointer-events-auto"
              onClick={() => {}}
            >
              <button 
                onClick={() => setIsLocked(false)}
                style={{ 
                  width: '100px', height: '100px', borderRadius: '50%', 
                  background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.2)',
                  backdropFilter: 'blur(20px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 0 50px rgba(0,0,0,0.5)'
                }}
              >
                <Lock size={40} className="accent-yellow" />
              </button>
              <p style={{ fontSize: '9px', letterSpacing: '0.2em', opacity: 0.5, fontWeight: 'bold', textTransform: 'uppercase' }}>
                Tap para desbloquear</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Decorative gradients */}
      <div style={{ position: 'fixed', top: '-10%', left: '-10%', width: '40%', height: '40%', background: 'radial-gradient(circle, rgba(59,130,246,0.1) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', bottom: '-10%', right: '-10%', width: '40%', height: '40%', background: 'radial-gradient(circle, rgba(250,204,21,0.05) 0%, transparent 70%)', pointerEvents: 'none' }} />
    </div>
  );
};

export default ARTracer;
