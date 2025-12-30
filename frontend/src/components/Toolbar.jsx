import React from 'react';
import { ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Pen, Highlighter, MousePointer2, Eraser } from 'lucide-react';

export default function Toolbar({ pageData, onPageChange, tool, setTool, zoom, setZoom, color, setColor }) {
  if (!pageData) return <div className="toolbar empty"><div className="logo">📄 AI Reader</div></div>;

  return (
    <header className="toolbar">
      <div className="logo">📄 AI Reader</div>

      <div className="tools-center">
        {/* PAGE NAVIGATION */}
        <div className="tool-group">
          <button onClick={() => onPageChange(-1)} disabled={pageData.current_page <= 1}>
            <ChevronLeft size={20}/>
          </button>
          <span className="page-count">
            Page {pageData.current_page} / {pageData.total_pages}
          </span>
          <button onClick={() => onPageChange(1)} disabled={pageData.current_page >= pageData.total_pages}>
            <ChevronRight size={20}/>
          </button>
        </div>

        {/* TOOLS (Cursor, Pen, Highlighter, Eraser) */}
        <div className="tool-group">
          <button 
            className={tool === "cursor" ? "active" : ""} 
            onClick={() => setTool("cursor")} 
            title="Select Text"
          >
            <MousePointer2 size={20}/>
          </button>
          
          <div className="separator"></div>

          <button 
            className={tool === "pen" ? "active" : ""} 
            onClick={() => setTool("pen")} 
            title="Pen"
          >
            <Pen size={20}/>
          </button>
          
          <button 
            className={tool === "highlighter" ? "active" : ""} 
            onClick={() => setTool("highlighter")} 
            title="Highlighter"
          >
            <Highlighter size={20}/>
          </button>
          <button 
            className={tool === "eraser" ? "active" : ""} 
            onClick={() => setTool("eraser")}
            title="Eraser"
          >
            <Eraser size={20} /> 
          </button>

          {/* COLOR PICKER (Only shows if Pen/Highlighter is active) */}
          {(tool === "pen" || tool === "highlighter") && (
            <input 
              type="color" 
              className="color-picker"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              title="Change Ink Color"
            />
          )}
        </div>

        {/* ZOOM */}
        <div className="tool-group">
          <button onClick={() => setZoom("out")}><ZoomOut size={20}/></button>
          <span className="zoom-label">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom("in")}><ZoomIn size={20}/></button>
        </div>
      </div>
    </header>
  );
}