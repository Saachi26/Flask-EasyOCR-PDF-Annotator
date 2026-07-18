import React from 'react';
import { Upload, Search, Zap, Highlighter, Cpu } from 'lucide-react';

const FEATURES = [
  { icon: Search, title: "Search scanned text", desc: "Full-text search across every page — even image-only scans." },
  { icon: Zap, title: "Instant for digital PDFs", desc: "Real text layers are read directly, with no OCR wait." },
  { icon: Highlighter, title: "Annotate freely", desc: "Pen, highlighter & eraser that persist across pages and zoom." },
  { icon: Cpu, title: "Smart OCR pipeline", desc: "Only true scans are OCR'd — once — then cached to disk." },
];

export default function UploadZone({ onUpload, loading }) {
  return (
    <div className="landing">
      <header className="landing-hero">
        <div className="hero-badge"><span className="logo-mark">📄</span> DocuLens</div>
        <h1>Make any PDF <span className="grad">readable</span>.</h1>
        <p>
          Turn scanned, image-only PDFs into documents you can search, select,
          highlight and annotate — right in your browser.
        </p>
      </header>

      <div className="upload-box">
        <Upload size={40} color="#8b5cf6" />
        <h3>Drop a PDF to get started</h3>
        <p>Drag &amp; drop or click to browse</p>
        <span className="upload-hint">Scanned or digital · your file is processed locally</span>
        <input
          type="file"
          onChange={onUpload}
          accept="application/pdf"
          disabled={loading}
        />
        {loading && <div className="upload-loader">Processing…</div>}
      </div>

      <div className="feature-grid">
        {FEATURES.map(({ icon: Icon, title, desc }) => (
          <div className="feature-card" key={title}>
            <div className="feature-icon"><Icon size={20} /></div>
            <div>
              <h4>{title}</h4>
              <p>{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
