'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
};

const PAD = 8; // CSS-px margin kept around the cropped ink on export

export default function SignaturePad({ value, onChange, disabled }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const dprRef = useRef(1);
  // Bounding box (CSS px) of everything drawn so far, so we can export just the
  // ink instead of the whole mostly-empty pad — otherwise scaling the full pad
  // down to fit the PDF's signature box crushes the actual strokes to near-nothing.
  const boundsRef = useRef({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  const [hasDrawn, setHasDrawn] = useState(!!value);

  // Size the canvas backing store to the element's displayed size, capped at 2x
  // device pixel ratio — keeps the exported PNG small regardless of display density.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    dprRef.current = dpr;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Always a fixed dark ink, regardless of app theme — the signature is exported
    // as a transparent PNG stamped straight onto a white PDF page, so light ink
    // (e.g. a dark-mode-matched color) would be invisible on the printed slip.
    ctx.strokeStyle = '#1a1a1a';

    if (value) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
        boundsRef.current = { minX: 0, minY: 0, maxX: rect.width, maxY: rect.height };
      };
      img.src = value;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const extendBounds = (p: { x: number; y: number }) => {
    const b = boundsRef.current;
    b.minX = Math.min(b.minX, p.x); b.maxX = Math.max(b.maxX, p.x);
    b.minY = Math.min(b.minY, p.y); b.maxY = Math.max(b.maxY, p.y);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    canvasRef.current?.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const p = getPoint(e);
    lastPointRef.current = p;
    extendBounds(p);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || disabled) return;
    const ctx = canvasRef.current?.getContext('2d');
    const from = lastPointRef.current;
    const to = getPoint(e);
    if (!ctx || !from) return;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    lastPointRef.current = to;
    extendBounds(to);
    if (!hasDrawn) setHasDrawn(true);
  };

  const stopDrawing = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    const canvas = canvasRef.current;
    const b = boundsRef.current;
    if (!canvas || b.minX === Infinity) return;

    const dpr = dprRef.current;
    const cssW = canvas.width / dpr, cssH = canvas.height / dpr;
    const x0 = Math.max(0, b.minX - PAD), y0 = Math.max(0, b.minY - PAD);
    const x1 = Math.min(cssW, b.maxX + PAD), y1 = Math.min(cssH, b.maxY + PAD);

    const sx = x0 * dpr, sy = y0 * dpr;
    const sw = Math.max(1, (x1 - x0) * dpr), sh = Math.max(1, (y1 - y0) * dpr);

    const cropped = document.createElement('canvas');
    cropped.width = sw; cropped.height = sh;
    const cctx = cropped.getContext('2d');
    if (!cctx) return;
    cctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    onChange(cropped.toDataURL('image/png'));
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    boundsRef.current = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    setHasDrawn(false);
    onChange(null);
  };

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDrawing}
        onPointerLeave={stopDrawing}
        className={`w-full h-32 rounded-xl border touch-none bg-gray-50 border-gray-200 ${
          disabled ? 'cursor-not-allowed opacity-60' : 'cursor-crosshair'
        }`}
      />
      {!hasDrawn && (
        <p className="absolute inset-0 flex items-center justify-center text-xs pointer-events-none text-gray-400">
          Draw your signature here
        </p>
      )}
      {hasDrawn && !disabled && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute top-2 right-2 text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
        >
          Clear
        </button>
      )}
    </div>
  );
}
