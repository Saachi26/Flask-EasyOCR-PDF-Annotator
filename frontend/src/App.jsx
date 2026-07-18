import React, { useState, useEffect, useRef } from 'react';
import Toolbar from './components/Toolbar';
import UploadZone from './components/UploadZone';
import DocumentViewer from './components/DocumentViewer';
import Sidebar from './components/Sidebar';
import SearchBar from './components/SearchBar';
import ProgressBar from './components/ProgressBar';
import './App.css';

// Same-origin by default (Flask serves the built SPA in prod; Vite proxies in dev).
// Override with VITE_API_URL if you run the API on a different host.
const API_URL = import.meta.env.VITE_API_URL || "";

// Parse a response defensively: an empty body (e.g. the server was killed mid-
// request) becomes a clear message instead of a raw "Unexpected end of JSON input".
async function readJson(res) {
  const text = await res.text();
  if (!text) {
    throw new Error(
      res.ok
        ? "The server returned an empty response. It may have run out of memory while processing this page."
        : `Server error (${res.status}). The page may be too large, or the server ran out of memory.`
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("The server returned an unreadable response.");
  }
}

function App() {
  const [pageData, setPageData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tool, setTool] = useState("cursor");
  const [color, setColor] = useState("#ff0000");
  // Per-tool stroke widths in the page's natural pixel space (scaled by zoom at
  // draw time). Highlighter is intentionally broad so it reads like a real
  // highlighter rather than a thin pen line.
  const [toolWidths, setToolWidths] = useState({ pen: 4, highlighter: 36, eraser: 28 });
  const [scaleFactor, setScaleFactor] = useState(1);
  const [error, setError] = useState(null);
  const [clearNonce, setClearNonce] = useState(0);
  const [ocrStatus, setOcrStatus] = useState(null);
  const [searchResults, setSearchResults] = useState(null);
  const [highlight, setHighlight] = useState("");

  const scrollContainerRef = useRef(null);
  const pageCacheRef = useRef({});   // pageNum -> payload, for instant re-visits

  const clearAnnotations = () => setClearNonce((n) => n + 1);

  // --- AUTO FIT ---
  useEffect(() => {
    if (pageData && scrollContainerRef.current) {
      const containerHeight = scrollContainerRef.current.clientHeight;
      const newScale = (containerHeight - 80) / pageData.height;
      setScaleFactor(Math.min(newScale, 1.5));
    }
  }, [pageData?.current_page]);

  // --- Poll background OCR progress for the current document ---
  useEffect(() => {
    if (!pageData?.filename) return;
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch(`${API_URL}/status?filename=${encodeURIComponent(pageData.filename)}`);
        const s = await res.json();
        if (!active) return;
        setOcrStatus(s);
        if (!s.done) setTimeout(poll, 1200);
      } catch {
        /* transient — stop polling silently */
      }
    };
    poll();
    return () => { active = false; };
  }, [pageData?.filename]);

  // --- Page fetching with a client-side cache ---
  const fetchPage = async (pageNum) => {
    const cached = pageCacheRef.current[pageNum];
    if (cached) return cached;
    const res = await fetch(`${API_URL}/change-page`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: pageData.filename, page: pageNum }),
    });
    const data = await readJson(res);
    if (!res.ok || data.error) throw new Error(data.error || `Failed to load page (${res.status})`);
    pageCacheRef.current[data.current_page] = data;
    return data;
  };

  const prefetch = (pageNum, total) => {
    if (pageNum < 1 || pageNum > total) return;
    if (pageCacheRef.current[pageNum]) return;
    fetchPage(pageNum).catch(() => {});   // warm the cache, ignore failures
  };

  const goToPage = async (pageNum) => {
    if (!pageData) return;
    const total = pageData.total_pages;
    if (pageNum < 1 || pageNum > total || pageNum === pageData.current_page) return;
    setError(null);

    const cached = pageCacheRef.current[pageNum];
    if (cached) {
      setPageData(cached);
    } else {
      setLoading(true);
      try {
        setPageData(await fetchPage(pageNum));
      } catch (err) {
        setError(err.message || "Failed to change page");
      }
      setLoading(false);
    }
    prefetch(pageNum + 1, total);
    prefetch(pageNum - 1, total);
  };

  const stepPage = (dir) => {
    if (pageData) goToPage(pageData.current_page + dir);
  };

  // --- Upload ---
  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    pageCacheRef.current = {};
    setOcrStatus(null);
    setSearchResults(null);
    setHighlight("");

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API_URL}/upload`, { method: 'POST', body: formData });
      const data = await readJson(res);
      if (!res.ok || data.error) throw new Error(data.error || `Upload failed (${res.status})`);
      pageCacheRef.current[data.current_page] = data;
      setPageData(data);
      prefetch(2, data.total_pages);
    } catch (err) {
      setError(err.message || "Could not reach the server. Is the backend running on port 5002?");
    }
    setLoading(false);
  };

  const handleZoom = (type) => {
    const newScale = type === "in" ? scaleFactor * 1.2 : scaleFactor / 1.2;
    setScaleFactor(Math.min(Math.max(newScale, 0.2), 3.0));
  };

  // --- Search ---
  const runSearch = async (query) => {
    setHighlight(query);
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: pageData.filename, query }),
      });
      const data = await readJson(res);
      setSearchResults(data.results || []);
    } catch {
      setSearchResults([]);
    }
  };

  const goToResult = (result) => goToPage(result.page);

  return (
    <div className="app-container">
      <Toolbar
        pageData={pageData}
        onPageChange={stepPage}
        tool={tool} setTool={setTool}
        zoom={scaleFactor} setZoom={handleZoom}
        color={color} setColor={setColor}
        toolWidths={toolWidths} setToolWidths={setToolWidths}
        onClear={clearAnnotations}
      />

      <div className="app-body">
        {pageData && (
          <aside className="left-panel">
            <SearchBar
              onSearch={runSearch}
              results={searchResults}
              onJump={goToResult}
            />
            <ProgressBar status={ocrStatus} />
            <Sidebar pageData={pageData} onGoTo={goToPage} />
          </aside>
        )}

        <main className="workspace" ref={scrollContainerRef}>
          {error && (
            <div className="error-banner" role="alert">
              <span>⚠️ {error}</span>
              <button onClick={() => setError(null)} aria-label="Dismiss">✕</button>
            </div>
          )}

          {!pageData ? (
            <UploadZone onUpload={handleUpload} loading={loading} />
          ) : (
            <DocumentViewer
              pageData={pageData}
              tool={tool}
              color={color}
              toolWidths={toolWidths}
              zoomScale={scaleFactor}
              clearNonce={clearNonce}
              highlight={highlight}
            />
          )}

          {loading && <div className="spinner">✨ Processing...</div>}
        </main>
      </div>
    </div>
  );
}

export default App;
