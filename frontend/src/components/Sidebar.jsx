import React from 'react';

const API_URL = import.meta.env.VITE_API_URL || "";

export default function Sidebar({ pageData, onGoTo }) {
  if (!pageData) return null;

  return (
    <div className="thumbnail-sidebar">
      <div className="sidebar-header">
        Pages ({pageData.total_pages})
      </div>

      <div className="thumbnails-list">
        {Array.from({ length: pageData.total_pages }, (_, i) => i + 1).map((pageNum) => (
          <div
            key={pageNum}
            className={`thumbnail-item ${pageData.current_page === pageNum ? 'active' : ''}`}
            onClick={() => onGoTo(pageNum)}
          >
            <img
              className="thumb-img"
              src={`${API_URL}/thumbnail/${encodeURIComponent(pageData.filename)}/${pageNum}`}
              alt={`Page ${pageNum}`}
              loading="lazy"
              draggable={false}
            />
            <span className="page-number">{pageNum}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
