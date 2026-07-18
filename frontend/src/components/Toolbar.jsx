import React from 'react';
import { ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Pen, Highlighter, MousePointer2, Eraser, Trash2 } from 'lucide-react';

// Adjustable thickness range (natural px) per drawing tool.
const WIDTH_RANGE = { pen: [1, 16], highlighter: [12, 60], eraser: [6, 60] };

export default function Toolbar({ pageData, onPageChange, tool, setTool, zoom, setZoom, color, setColor, toolWidths, setToolWidths, onClear }) {
  const Logo = () => (
    <div className="logo"><span className="logo-mark">📄</span> DocuLens</div>
  );

  if (!pageData) return <div className="toolbar empty"><Logo /></div>;

  const isEmbedded = pageData.source === "embedded";
  const range = WIDTH_RANGE[tool];
  const setWidth = (v) => setToolWidths((w) => ({ ...w, [tool]: Number(v) }));

  return (
    <header className="toolbar">
      <Logo />

      <div className="tools-center">
        {/* SOURCE BADGE — shows how the current page was read */}
        <span className={`source-badge ${isEmbedded ? "embedded" : "ocr"}`} title={isEmbedded ? "Read directly from the PDF's text layer" : "Recognized with OCR"}>
          {isEmbedded ? "⚡ Digital text" : "🔍 OCR"}
        </span>

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

          <button
            onClick={onClear}
            title="Clear annotations on this page"
          >
            <Trash2 size={20} />
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

          {/* THICKNESS (Pen / Highlighter / Eraser) */}
          {range && (
            <div className="thickness" title={`${tool} thickness`}>
              <input
                type="range"
                className="thickness-slider"
                min={range[0]}
                max={range[1]}
                value={toolWidths[tool]}
                onChange={(e) => setWidth(e.target.value)}
              />
              <span className="thickness-value">{toolWidths[tool]}</span>
            </div>
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