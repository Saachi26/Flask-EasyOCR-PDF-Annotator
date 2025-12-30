import React, { useState, useEffect, useRef } from 'react';
import Toolbar from './components/Toolbar';
import UploadZone from './components/UploadZone';
import DocumentViewer from './components/DocumentViewer';
import Sidebar from './components/Sidebar';
import './App.css';

const API_URL = "http://127.0.0.1:5002";

function App() {
  const [pageData, setPageData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tool, setTool] = useState("cursor");
  const [color, setColor] = useState("#ff0000");
  const [scaleFactor, setScaleFactor] = useState(1);
  const scrollContainerRef = useRef(null);

  // --- AUTO FIT LOGIC ---
  useEffect(() => {
    if (pageData && scrollContainerRef.current) {
      const containerHeight = scrollContainerRef.current.clientHeight;
      const newScale = (containerHeight - 80) / pageData.height;
      setScaleFactor(Math.min(newScale, 1.5));
    }
  }, [pageData]);

  // --- ACTIONS ---
  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API_URL}/upload`, { method: 'POST', body: formData });
      const data = await res.json();
      setPageData(data);
    } catch (err) { alert("Server Error"); }
    setLoading(false);
  };


  const changePage = async (dir) => {
    if (!pageData) return;
    const targetPage = pageData.current_page + dir;
    
    // Bounds check
    if (targetPage < 1 || targetPage > pageData.total_pages) return;

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/change-page`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          filename: pageData.filename, 
          page: targetPage 
        })
      });
      const newData = await res.json();
      if (newData.success) setPageData(newData);
    } catch (err) {
      console.error("Failed to change page", err);
    }
    setLoading(false);
  };

  const handleZoom = (type) => {
    const newScale = type === "in" ? scaleFactor * 1.2 : scaleFactor / 1.2;
    setScaleFactor(Math.min(Math.max(newScale, 0.2), 3.0));
  };

  return (
    <div className="app-container">
      <Toolbar 
        pageData={pageData} 
        onPageChange={changePage}
        tool={tool} setTool={setTool}
        zoom={scaleFactor} setZoom={handleZoom}
        color={color} setColor={setColor}
      />

      <div className="app-body">
        
        {pageData && (
          <Sidebar 
            pageData={pageData} 
            onPageChange={changePage} 
          />
        )}

        <main className="workspace" ref={scrollContainerRef}>
          {!pageData ? (
            <UploadZone onUpload={handleUpload} loading={loading} />
          ) : (
            <DocumentViewer 
              pageData={pageData} 
              tool={tool} 
              color={color}
              zoomScale={scaleFactor} 
            />
          )}
          
          {loading && <div className="spinner">✨ Processing...</div>}
        </main>
      </div>
    </div>
  );
}

export default App;