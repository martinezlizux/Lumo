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
  Maximize2,
  ChevronDown,
  RefreshCw,
  Video,
  StopCircle,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Brain,
  Activity,
  Plus,
  Minus
} from 'lucide-react';
import { useGesture } from '@use-gesture/react';

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
  .gesture-area {
    touch-action: none;
    -webkit-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;
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
  }, [startCamera]);

  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
    };
  }, [stream]);

  return { videoRef, stream, isTorchOn, hasTorch, toggleTorch, startCamera, error };
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
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        request();
      }
    };

    request();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [request]);

  return active;
};

// --- CONSTANTES DE CONFIGURACIÓN ---
const VISION_WIDTH = 320;
const SMOOTHING_FACTOR = 0.15;

const ARTracer: React.FC = () => {
  const { videoRef, stream, isTorchOn, hasTorch, toggleTorch, startCamera, error } = useCamera();
  const wakeLockActive = useWakeLock();

  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<Blob[]>([]);

  const handleRecordToggle = () => {
    if (!stream) return;
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    } else {
      recordedChunks.current = [];
      const types = ['video/webm; codecs=vp9', 'video/webm', 'video/mp4'];
      const mimeType = types.find(t => MediaRecorder.isTypeSupported(t)) || '';
      const recorder = new MediaRecorder(stream, { mimeType });
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.current.push(e.data);
      };
      
      recorder.onstop = () => {
        const blob = new Blob(recordedChunks.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
        a.download = `lumo-timelapse-${new Date().getTime()}.${ext}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
      };
      
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    }
  };

  // Estados de Imagen
  const [image, setImage] = useState<string | null>(null);
  const [opacity, setOpacity] = useState(0.5);
  const [rotation, setRotation] = useState(0);
  const [isMirrored, setIsMirrored] = useState(false);
  const [isOutlineMode, setIsOutlineMode] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [isMinimized, setIsMinimized] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [showGestureHint, setShowGestureHint] = useState(false);

  // --- LÓGICA DE MODO MURAL INTELIGENTE (IA SPATIAL ANCHOR) ---
  const [isAISpatialMode, setIsAISpatialMode] = useState(false);
  const [trackingStatus, setTrackingStatus] = useState<'idle' | 'anchoring' | 'tracking' | 'lost'>('idle');
  const [homographyMatrix, setHomographyMatrix] = useState<number[] | null>(null);
  const [trackingPoints, setTrackingPoints] = useState<{x: number, y: number}[]>([]);
  const workerRef = useRef<Worker | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const processingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const trackingStatusRef = useRef(trackingStatus);

  // Sync ref with state for the processing loop
  useEffect(() => {
    trackingStatusRef.current = trackingStatus;
  }, [trackingStatus]);

  // Filtro Kalman simple para suavizar la matriz
  const kalmanMatrix = useRef<number[] | null>(null);

  useEffect(() => {
    // Inicializar Worker
    const worker = new Worker(new URL('../workers/vision.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    
    worker.onmessage = (e) => {
      const { type, matrix, points } = e.data;
      if (type === 'anchored') {
        setTrackingStatus('tracking');
      } else if (type === 'tracked') {
        setTrackingPoints(points);
        setTrackingStatus('tracking');
        
        // Aplicar filtrado a la matriz
        if (!kalmanMatrix.current) {
          kalmanMatrix.current = matrix;
        } else {
          kalmanMatrix.current = kalmanMatrix.current.map((v, i) => v * (1 - SMOOTHING_FACTOR) + matrix[i] * SMOOTHING_FACTOR);
        }
        setHomographyMatrix([...(kalmanMatrix.current!)]);
      } else if (type === 'lost') {
        setTrackingStatus('lost');
      }
    };

    return () => {
      worker.terminate();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []); // Stable setters and refs don't need to be in deps

  const renderPoints = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !trackingPoints.length) return;
    
    if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const scaleX = canvas.width / 320;
    const scaleY = scaleX; 

    ctx.fillStyle = '#22c55e';
    trackingPoints.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x * scaleX, p.y * scaleY, 2, 0, Math.PI * 2);
      ctx.fill();
    });
  }, [trackingPoints]);

   const processFrame = useCallback(() => {
    if (!videoRef.current || !workerRef.current || trackingStatusRef.current === 'idle') {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    // Verificar que el video tenga dimensiones válidas y esté listo
    if (videoRef.current.readyState < 2 || videoRef.current.videoWidth === 0) {
      rafRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const canvas = processingCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const buffer = imageData.data.buffer;

    workerRef.current.postMessage({ 
      type: trackingStatusRef.current === 'anchoring' ? 'anchor' : 'track', 
      data: buffer,
      w: canvas.width,
      h: canvas.height
    }, [buffer]);

    renderPoints();
    rafRef.current = requestAnimationFrame(processFrame);
  }, [videoRef, renderPoints]);

  const startAIAnchoring = useCallback(() => {
    if (!videoRef.current || !workerRef.current) return;
    if (videoRef.current.videoWidth === 0) {
      console.warn("[ARTracer] Video not ready yet");
      return;
    }
    
    const w = VISION_WIDTH; 
    const h = Math.round((videoRef.current.videoHeight / videoRef.current.videoWidth) * w);
    
    if (!processingCanvasRef.current) {
      processingCanvasRef.current = document.createElement('canvas');
      processingCanvasRef.current.width = w;
      processingCanvasRef.current.height = h;
      workerRef.current.postMessage({ type: 'init', w, h });
    }

    // Actualizar ref inmediatamente para que el primer frame del loop ya use el tipo correcto
    trackingStatusRef.current = 'anchoring';
    setTrackingStatus('anchoring');
    setIsAISpatialMode(true);
    
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(processFrame);
  }, [videoRef, processFrame]);

  // Convertir homografía de 3x3 a matrix3d de CSS
  const getMatrix3D = useCallback(() => {
    if (!homographyMatrix) return 'matrix3d(1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1)';
    const m = homographyMatrix;
    // La matriz de homografía jsfeat es 3x3 row-major: m[0]..m[8]
    // matrix3d de CSS es 4x4 column-major
    return `matrix3d(
      ${m[0]}, ${m[3]}, 0, ${m[6]},
      ${m[1]}, ${m[4]}, 0, ${m[7]},
      0, 0, 1, 0,
      ${m[2]}, ${m[5]}, 0, ${m[8]}
    )`;
  }, [homographyMatrix]);

  // La posición final de la imagen es la suma del offset manual
  const finalX = offset.x;
  const finalY = offset.y;

  // Muestra el hint al cargar la imagen, lo oculta solo tras 2.5s
  useEffect(() => {
    if (image) {
      setShowGestureHint(true);
      const t = setTimeout(() => setShowGestureHint(false), 2800);
      return () => clearTimeout(t);
    }
  }, [image]);

  // GESTOS TÁCTILES
  const bind = useGesture(
    {
      onDrag: ({ offset: [x, y], touches }) => {
        // Solo drag con 1 dedo (2 dedos = pinch)
        if (isLocked || touches > 1) return;
        setShowGestureHint(false); // Oculta el hint al primer gesto
        setOffset({ x, y });
      },
      onPinch: ({ offset: [scale, angle] }) => {
        if (isLocked) return;
        setShowGestureHint(false);
        setZoom(Math.max(0.1, scale));
        setRotation(angle);
      },
    },
    {
      // passive:false es CRÍTICO para capturar gestos antes del browser
      eventOptions: { passive: false },
      drag: { 
        from: () => [offset.x, offset.y],
        filterTaps: true,
        threshold: 5,
        pointer: { touch: true },
      },
      pinch: { 
        from: () => [zoom, rotation],
        scaleBounds: { min: 0.1, max: 10 },
        pointer: { touch: true },
      },
    }
  );

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

      {/* CANVAS PARA PUNTOS DE IA (VISUAL FEEDBACK) */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          zIndex: 25,
          pointerEvents: 'none',
          opacity: isAISpatialMode ? 0.8 : 0
        }}
      />

      {/* CAPA DE GESTOS — z-30: encima de imagen (z-10) y decorativos, debajo de UI panel (z-40) */}
      {image && (
        <div 
          {...(!isLocked ? bind() : {})}
          className="gesture-area"
          style={{
            position: 'absolute',
            inset: 0,
            // Ocupa toda la pantalla MENOS el panel de controles cuando está abierto
            bottom: isMinimized || isLocked ? 0 : '260px',
            zIndex: 30,
            cursor: isLocked ? 'default' : 'move',
            touchAction: 'none',         // inline: obligatorio para @use-gesture
            WebkitUserSelect: 'none',
            userSelect: 'none',
            pointerEvents: isLocked ? 'none' : 'auto',
          }}
        />
      )}

      {/* IMAGEN DE CALCO (OVERLAY) */}
      <AnimatePresence>
        {image && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: opacity }}
            className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none"
            style={{ 
              perspective: '1000px', // Añadir perspectiva para transformaciones 3D
              transformStyle: 'preserve-3d'
            }}
          >
            {/* Contenedor de Anclaje (IA) */}
            <motion.div
              animate={{
                transform: isAISpatialMode ? getMatrix3D() : 'matrix3d(1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1)'
              }}
              transition={{ type: 'tween', duration: 0.05 }} // Suavizado ligero para el tracking
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transformOrigin: 'center center'
              }}
            >
              {/* Contenedor de Ajuste Manual */}
              <motion.img
                src={image}
                alt="Overlay"
                className={isOutlineMode ? 'outline-mode' : ''}
                animate={{
                  x: finalX,
                  y: finalY,
                  rotate: rotation,
                  scaleX: isMirrored ? -zoom : zoom,
                  scaleY: zoom,
                }}
                transition={{ 
                  type: 'spring', 
                  damping: 30, 
                  stiffness: 250, 
                  mass: 0.5,
                  // Si estamos en modo IA, queremos que los ajustes manuales sean instantáneos para que no haya lag
                  ...(isAISpatialMode ? { duration: 0 } : {})
                }}
                style={{
                  maxWidth: '90%',
                  maxHeight: '90%',
                  objectFit: 'contain',
                  boxShadow: (isAISpatialMode && trackingStatus === 'tracking') ? '0 0 50px rgba(34, 197, 94, 0.4)' : 'none',
                  filter: isOutlineMode ? 'grayscale(100%) contrast(500%) invert(100%) brightness(110%)' : 'none',
                  transformOrigin: 'center center'
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* GESTURE HINT — aparece al cargar imagen, desaparece solo o al tocar */}
      <AnimatePresence>
        {showGestureHint && (
          <motion.div
            key="gesture-hint"
            initial={{ opacity: 0, scale: 0.85, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 10 }}
            transition={{ type: 'spring', damping: 20, stiffness: 200 }}
            style={{
              position: 'absolute',
              inset: 0,
              bottom: isMinimized ? 0 : '260px',
              zIndex: 35,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <div style={{
              background: 'rgba(10, 10, 10, 0.55)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '24px',
              padding: '20px 28px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '14px',
            }}>
              {/* Iconos de dedos animados */}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px' }}>
                {/* Dedo drag */}
                <motion.div
                  animate={{ x: [0, 18, 0] }}
                  transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}
                >
                  <svg width="26" height="38" viewBox="0 0 26 38" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="9" y="0" width="8" height="22" rx="4" fill="white" opacity="0.9"/>
                    <path d="M4 18 Q1 22 2 28 Q4 36 13 37 Q22 36 24 28 Q25 22 22 18 L17 14 V10 Q17 8 13 8 Q9 8 9 10 V18 Z" fill="white" opacity="0.9"/>
                  </svg>
                  <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'rgba(255,255,255,0.4)' }} />
                </motion.div>

                {/* Separador */}
                <div style={{ width: '1px', height: '30px', background: 'rgba(255,255,255,0.15)', marginBottom: '8px' }} />

                {/* Dos dedos pinch */}
                <motion.div
                  animate={{ gap: ['14px', '6px', '14px'] }}
                  transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut', delay: 0.3 }}
                  style={{ display: 'flex', alignItems: 'flex-end', gap: '14px' }}
                >
                  {[0, 1].map(i => (
                    <motion.div
                      key={i}
                      animate={{ x: i === 0 ? [0, 5, 0] : [0, -5, 0] }}
                      transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut', delay: 0.3 }}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}
                    >
                      <svg width="18" height="28" viewBox="0 0 18 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <rect x="5" y="0" width="8" height="16" rx="4" fill="white" opacity="0.7"/>
                        <path d="M2 14 Q0 17 1 21 Q3 27 9 27 Q15 27 17 21 Q18 17 16 14 L12 10 V8 Q12 6 9 6 Q6 6 6 8 V14 Z" fill="white" opacity="0.7"/>
                      </svg>
                      <div style={{ width: '3px', height: '3px', borderRadius: '50%', background: 'rgba(255,255,255,0.3)' }} />
                    </motion.div>
                  ))}
                </motion.div>
              </div>

              {/* Labels */}
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                <span style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '0.08em', opacity: 0.5, color: '#fff', textTransform: 'uppercase' }}>
                  Arrastra
                </span>
                <div style={{ width: '3px', height: '3px', borderRadius: '50%', background: 'rgba(255,255,255,0.25)' }} />
                <span style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '0.08em', color: '#facc15', textTransform: 'uppercase' }}>
                  Pellizca para zoom
                </span>
                <div style={{ width: '3px', height: '3px', borderRadius: '50%', background: 'rgba(255,255,255,0.25)' }} />
                <span style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '0.08em', opacity: 0.5, color: '#fff', textTransform: 'uppercase' }}>
                  Rota
                </span>
              </div>
            </div>
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
              <button onClick={handleRecordToggle} className="glass-button" style={{ 
                background: isRecording ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.08)',
                color: isRecording ? '#ef4444' : '#fff',
                borderColor: isRecording ? 'rgba(239, 68, 68, 0.5)' : 'rgba(255,255,255,0.1)',
                boxShadow: isRecording ? '0 0 20px rgba(239, 68, 68, 0.4)' : 'none'
              }}>
                {isRecording ? <div className="flex items-center gap-2"><StopCircle size={22} /><span className="text-[10px] font-bold tracking-widest animate-pulse">REC</span></div> : <Video size={22} />}
              </button>

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
        <AnimatePresence mode="wait">
          {isLocked ? (
            /* MURAL MODE (LOCK) OVERLAY */
            <motion.div 
              key="lock-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[100] pointer-events-none flex flex-col justify-between p-8"
            >
              {/* Top info badge */}
              <div className="flex justify-center w-full">
                <div style={{ background: 'rgba(0,0,0,0.6)', padding: '8px 16px', borderRadius: '16px', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isAISpatialMode ? '#22c55e' : '#facc15', boxShadow: `0 0 10px ${isAISpatialMode ? '#22c55e' : '#facc15'}` }} className="animate-pulse" />
                  <span style={{ fontSize: '10px', fontWeight: '900', letterSpacing: '0.15em', color: '#fff', textTransform: 'uppercase' }}>
                    {isAISpatialMode ? `MURAL ANCLADO (${trackingStatus})` : 'MODO MURAL BLOQUEADO'}
                  </span>
                </div>
              </div>

              {/* Central Area: Left (Scales), Center (AI), Right (Position) */}
              <div className="flex items-center justify-between w-full flex-1">
                {/* Left: Escala */}
                <div className="flex flex-col items-center gap-3 pointer-events-auto">
                  <span className="text-[8px] font-black text-white/40 tracking-[0.2em] uppercase">Escala</span>
                  <div className="flex flex-col gap-2">
                    <button className="glass-button p-4" onClick={() => setZoom(z => Math.min(10, z + 0.1))}><Plus size={20}/></button>
                    <button className="glass-button p-4" onClick={() => setZoom(z => Math.max(0.1, z - 0.1))}><Minus size={20}/></button>
                  </div>
                </div>

                {/* Center: AI Controls */}
                <div className="flex flex-col items-center gap-4 pointer-events-auto">
                  <div className="relative">
                    {trackingStatus === 'anchoring' && (
                      <motion.div 
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1.2, opacity: 1 }}
                        transition={{ repeat: Infinity, duration: 1.5, repeatType: 'reverse' }}
                        className="absolute inset-0 border-2 border-indigo-500 rounded-full"
                      />
                    )}
                    <button 
                      onClick={() => {
                        if (isAISpatialMode) {
                          setIsAISpatialMode(false);
                          setTrackingStatus('idle');
                          if (rafRef.current) cancelAnimationFrame(rafRef.current);
                        } else {
                          startAIAnchoring();
                        }
                      }}
                      className="glass-button"
                      style={{ 
                        width: '100px',
                        height: '100px',
                        borderRadius: '50%',
                        flexDirection: 'column',
                        background: isAISpatialMode 
                          ? 'rgba(34, 197, 94, 0.2)' 
                          : 'linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(168, 85, 247, 0.2) 100%)',
                        color: isAISpatialMode ? '#22c55e' : '#fff',
                        borderColor: isAISpatialMode ? '#22c55e' : 'rgba(255,255,255,0.2)',
                        gap: '8px',
                        boxShadow: isAISpatialMode ? '0 0 30px rgba(34, 197, 94, 0.3)' : '0 10px 30px rgba(0,0,0,0.3)'
                      }}
                    >
                      <Brain size={32} className={trackingStatus === 'tracking' ? 'animate-pulse' : ''} />
                      <span style={{ fontSize: '9px', fontWeight: '900', letterSpacing: '0.05em' }}>
                        {trackingStatus === 'anchoring' ? 'ESCANEANDO' : 
                         isAISpatialMode ? 'DETENER IA' : 'ANCLAJE IA'}
                      </span>
                    </button>
                  </div>
                  
                  {isAISpatialMode && (
                    <motion.button 
                      whileHover={{ scale: 1.05, opacity: 1 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={startAIAnchoring}
                      style={{ 
                        fontSize: '9px', 
                        color: '#fff', 
                        opacity: 0.5, 
                        background: 'rgba(255,255,255,0.05)', 
                        border: '1px solid rgba(255,255,255,0.1)', 
                        borderRadius: '12px',
                        padding: '6px 12px',
                        fontWeight: 'bold',
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        cursor: 'pointer',
                        marginTop: '4px'
                      }}
                    >
                      Reiniciar Anclaje
                    </motion.button>
                  )}

                  {trackingStatus === 'lost' && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#f87171', fontSize: '9px', fontWeight: '900', letterSpacing: '0.1em' }}
                    >
                      <Activity size={12} className="animate-bounce" /> RECUPERANDO...
                    </motion.div>
                  )}
                </div>

                {/* Right: Posición */}
                <div className="flex flex-col items-center gap-3 pointer-events-auto">
                  <span className="text-[8px] font-black text-white/40 tracking-[0.2em] uppercase">Posición</span>
                  <div className="flex flex-col items-center gap-2">
                    <button className="glass-button p-4" onClick={() => setOffset(o => ({ ...o, y: o.y - 5 }))}><ArrowUp size={20}/></button>
                    <div className="flex gap-2">
                      <button className="glass-button p-4" onClick={() => setOffset(o => ({ ...o, x: o.x - 5 }))}><ArrowLeft size={20}/></button>
                      <button className="glass-button p-4" onClick={() => setOffset(o => ({ ...o, x: o.x + 5 }))}><ArrowRight size={20}/></button>
                    </div>
                    <button className="glass-button p-4" onClick={() => setOffset(o => ({ ...o, y: o.y + 5 }))}><ArrowDown size={20}/></button>
                  </div>
                </div>
              </div>

              {/* Bottom: Unlock Switch */}
              <div className="flex justify-center w-full pointer-events-auto pb-4">
                <button 
                  onClick={() => {
                    setIsLocked(false);
                    setIsAISpatialMode(false);
                    setTrackingStatus('idle');
                    if (rafRef.current) cancelAnimationFrame(rafRef.current);
                  }}
                  style={{ 
                    padding: '16px 32px',
                    borderRadius: '40px', 
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    backdropFilter: 'blur(30px)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    cursor: 'pointer',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
                  }}
                >
                  <Lock size={20} className="accent-yellow" />
                  <span style={{ fontSize: '11px', fontWeight: '900', letterSpacing: '0.2em' }}>SALIR DEL MODO MURAL</span>
                </button>
              </div>
            </motion.div>
          ) : isMinimized ? (
            /* MINIMIZED VIEW - ACTION BUTTON */
            <div key="minimized-btn" className="absolute bottom-6 right-6 pointer-events-auto">
              <motion.button
                initial={{ scale: 0, rotate: -45 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 0, rotate: 45 }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setIsMinimized(false)}
                className="glass-button"
                style={{ 
                  width: '64px', height: '64px', border: '1px solid rgba(255,255,255,0.2)',
                  background: 'rgba(15, 15, 15, 0.6)', borderRadius: '22px', cursor: 'pointer'
                }}
              >
                 <Maximize2 size={24} className="accent-yellow" />
              </motion.button>
            </div>
          ) : (
            /* FULL CONTROLS */
            <motion.div 
              key="full-controls"
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              className="glass-panel p-6 pointer-events-auto max-w-lg mx-auto w-full flex flex-col gap-6"
            >
              {/* Header inside Panel */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '-10px' }}>
                <span style={{ fontSize: '10px', fontWeight: '900', letterSpacing: '0.1em', opacity: 0.3 }}>HERRAMIENTAS DE CALCO</span>
                <button 
                  onClick={() => setIsMinimized(true)}
                  style={{ background: 'transparent', border: 'none', color: '#fff', opacity: 0.5, cursor: 'pointer', padding: '10px' }}
                >
                  <ChevronDown size={20} />
                </button>
              </div>

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
                  <label className="glass-button" style={{ background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer' }}>
                    <ImageIcon size={22} />
                    <input type="file" accept="image/*" onChange={handleUpload} style={{ display: 'none' }} />
                  </label>
                  <button onClick={() => setRotation(r => (r + 90) % 360)} className="glass-button" style={{ cursor: 'pointer' }}>
                    <RotateCw size={22} />
                  </button>
                  <button onClick={() => setIsMirrored(!isMirrored)} className="glass-button" style={{ 
                    background: isMirrored ? '#fff' : 'rgba(255,255,255,0.08)',
                    color: isMirrored ? '#000' : '#fff',
                    cursor: 'pointer'
                  }}>
                    <FlipHorizontal size={22} />
                  </button>
                  <button onClick={() => { setOffset({ x: 0, y: 0 }); setZoom(1); setRotation(0); }} className="glass-button" style={{ cursor: 'pointer' }}>
                    <RefreshCw size={20} />
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => setIsOutlineMode(!isOutlineMode)} className="glass-button" style={{ 
                    background: isOutlineMode ? '#facc15' : 'rgba(255,255,255,0.08)',
                    color: isOutlineMode ? '#000' : '#fff',
                    fontWeight: '900', fontSize: '10px',
                    cursor: 'pointer'
                  }}>
                    CONTORNO
                  </button>
                  <button onClick={() => setIsLocked(true)} className="glass-button" style={{ background: '#fff', color: '#000', cursor: 'pointer' }}>
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
