import React from 'react';

export default function Sidebar({ pageData, onPageChange }) {
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
            onClick={() => onPageChange(pageNum - pageData.current_page)} 
          >
            <span className="page-number">{pageNum}</span>
            <div className="thumb-placeholder">Page {pageNum}</div>
          </div>
        ))}
      </div>
    </div>
  );
}