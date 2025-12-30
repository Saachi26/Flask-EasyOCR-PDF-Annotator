import React, { useRef, useEffect, useState } from 'react';

const API_URL = "http://127.0.0.1:5002";

export default function DocumentViewer({ pageData, tool, color, zoomScale }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
  }, [pageData.current_page]);

  const getCoords = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  // --- DRAWING LOGIC ---
  const startDrawing = (e) => {
    if (tool === "cursor") return;
    const { x, y } = getCoords(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing || tool === "cursor") return;
    const { x, y } = getCoords(e);
    const ctx = canvasRef.current.getContext('2d');
    
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out"; 
      ctx.lineWidth = 20;
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = color;
      
      if (tool === "pen") {
        ctx.lineWidth = 2;
        ctx.globalAlpha = 1.0;
      } else if (tool === "highlighter") {
        ctx.lineWidth = 15;
        ctx.globalAlpha = 0.3; 
      }
    }
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (tool !== "cursor") {
      const ctx = canvasRef.current.getContext('2d');
      ctx.closePath();
      setIsDrawing(false);
      ctx.globalCompositeOperation = "source-over";
    }
  };

  return (
    <div 
      className="document-wrapper"
      style={{ 
        width: pageData.width * zoomScale, 
        height: pageData.height * zoomScale,
        cursor: tool === "cursor" ? "default" : "crosshair",
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
            className="ocr-box"
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