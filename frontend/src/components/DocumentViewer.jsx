import React, { useRef, useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || "";

// Stroke line widths default to the page's *natural* pixel space and are scaled
// by the current zoom at draw time, so annotations survive zooming. Widths are
// now user-adjustable and come in via the `toolWidths` prop.
const DEFAULT_WIDTH = { pen: 4, highlighter: 36, eraser: 28 };
const TOOL_ALPHA = { pen: 1.0, highlighter: 0.3, eraser: 1.0 };

// SVG icon cursors (lucide paths) so the pointer reflects the active tool. Each
// path is drawn twice — a white halo under a colored stroke — so it stays
// visible over any page. The hotspot is placed at each tool's working tip.
const CURSOR_ICONS = {
  pen: {
    paths: ["M12 20h9", "M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"],
    hotspot: "3 25",
  },
  highlighter: {
    paths: ["M9 11l-6 6v3h9l3-3", "M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"],
    hotspot: "3 24",
  },
  eraser: {
    paths: ["M20 20H7L3 16a2 2 0 0 1 0-3L13 3a2 2 0 0 1 3 0l5 5a2 2 0 0 1 0 3l-8 8"],
    hotspot: "9 24",
  },
};

function cursorFor(tool, color) {
  const icon = CURSOR_ICONS[tool];
  if (!icon) return "default";
  const ink = tool === "eraser" ? "#333" : color;
  const halo = icon.paths.map((d) => `<path d='${d}' stroke='white' stroke-width='3.5'/>`).join("");
  const line = icon.paths.map((d) => `<path d='${d}' stroke='${ink}' stroke-width='1.75'/>`).join("");
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 24 24' ` +
    `fill='none' stroke-linecap='round' stroke-linejoin='round'>${halo}${line}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${icon.hotspot}, crosshair`;
}

export default function DocumentViewer({ pageData, tool, color, toolWidths, zoomScale, clearNonce, highlight }) {
  const query = (highlight || "").trim().toLowerCase();
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Persisted annotations: { [pageNumber]: Stroke[] } in natural coordinates.
  const annotationsRef = useRef({});
  const currentStrokeRef = useRef(null);

  const applyStyle = (ctx, stroke) => {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = stroke.width * zoomScale;
    if (stroke.tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.globalAlpha = 1;
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = stroke.color;
      ctx.globalAlpha = stroke.alpha;
    }
  };

  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const strokes = annotationsRef.current[pageData.current_page] || [];
    for (const stroke of strokes) {
      if (stroke.points.length < 2) continue;
      applyStyle(ctx, stroke);
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x * zoomScale, stroke.points[0].y * zoomScale);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x * zoomScale, stroke.points[i].y * zoomScale);
      }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  };

  // Reset all annotations when a different document is loaded (this component
  // stays mounted across uploads, so pages must not leak between documents).
  useEffect(() => {
    annotationsRef.current = {};
  }, [pageData.filename]);

  // Repaint whenever the page changes or the canvas is resized by a zoom change
  // (changing width/height attributes clears the canvas, so we must redraw).
  useEffect(() => {
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageData.current_page, zoomScale, pageData.width, pageData.height]);

  // Clear annotations on the current page when the toolbar's clear action fires.
  useEffect(() => {
    if (!clearNonce) return;
    delete annotationsRef.current[pageData.current_page];
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearNonce]);

  // Convert a mouse event to natural (zoom-independent) page coordinates.
  const getCoords = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: ((e.clientX - rect.left) * scaleX) / zoomScale,
      y: ((e.clientY - rect.top) * scaleY) / zoomScale,
    };
  };

  const startDrawing = (e) => {
    if (tool === "cursor") return;
    const { x, y } = getCoords(e);
    currentStrokeRef.current = {
      tool,
      color,
      width: toolWidths?.[tool] ?? DEFAULT_WIDTH[tool] ?? 2,
      alpha: TOOL_ALPHA[tool] ?? 1.0,
      points: [{ x, y }],
    };
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const stroke = currentStrokeRef.current;
    if (!stroke) return;
    const { x, y } = getCoords(e);
    const prev = stroke.points[stroke.points.length - 1];
    stroke.points.push({ x, y });

    // Draw only the newest segment so highlighter alpha doesn't stack.
    const ctx = canvasRef.current.getContext('2d');
    applyStyle(ctx, stroke);
    ctx.beginPath();
    ctx.moveTo(prev.x * zoomScale, prev.y * zoomScale);
    ctx.lineTo(x * zoomScale, y * zoomScale);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    const stroke = currentStrokeRef.current;
    if (stroke && stroke.points.length > 1) {
      const page = pageData.current_page;
      (annotationsRef.current[page] ||= []).push(stroke);
    }
    currentStrokeRef.current = null;
    setIsDrawing(false);
    const ctx = canvasRef.current.getContext('2d');
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  };

  return (
    <div
      className="document-wrapper"
      style={{
        width: pageData.width * zoomScale,
        height: pageData.height * zoomScale,
        cursor: cursorFor(tool, color),
        position: 'relative'
      }}
      onMouseDown={startDrawing}
      onMouseMove={draw}
      onMouseUp={stopDrawing}
      onMouseLeave={stopDrawing}
    >
      {/* LAYER 1: IMAGE */}
      <img
        src={`${API_URL}${pageData.image_url}`}
        alt="Page"
        className="page-image"
        draggable={false}
      />

      {/* LAYER 2: CANVAS */}
      <canvas
        ref={canvasRef}
        width={pageData.width * zoomScale}
        height={pageData.height * zoomScale}
        className="drawing-canvas"
        style={{ pointerEvents: tool === "cursor" ? "none" : "auto" }}
      />

      {/* LAYER 3: TEXT OVERLAY */}
      <div className="text-layer" style={{ pointerEvents: tool === "cursor" ? "auto" : "none" }}>
        {pageData.ocr_data.map((item, i) => (
          <div
            key={i}
            className={`ocr-box ${query && item.text.toLowerCase().includes(query) ? 'match' : ''}`}
            style={{
              left: `${(item.x / pageData.width) * 100}%`,
              top: `${(item.y / pageData.height) * 100}%`,
              width: `${(item.w / pageData.width) * 100}%`,
              height: `${(item.h / pageData.height) * 100}%`,
              fontSize: `${item.h * zoomScale * 0.8}px`,
            }}
          >
            {item.text}
          </div>
        ))}
      </div>
    </div>
  );
}
