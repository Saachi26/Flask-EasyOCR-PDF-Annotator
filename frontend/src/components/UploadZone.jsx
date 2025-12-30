import React from 'react';
import { Upload } from 'lucide-react';

export default function UploadZone({ onUpload, loading }) {
  return (
    <div className="upload-container">
      <div className="upload-box">
        <Upload size={48} color="#6b7280" />
        <h3>Upload PDF Textbook</h3>
        <p>Drag & drop or click to browse</p>
        <input 
          type="file" 
          onChange={onUpload} 
          accept="application/pdf" 
          disabled={loading}
        />
        {loading && <div className="upload-loader">Processing...</div>}
      </div>
    </div>
  );
}