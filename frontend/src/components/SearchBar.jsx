import React, { useState, useRef } from 'react';
import { Search, X } from 'lucide-react';

// Debounced search box + results list. Searches the OCR/text layer across every
// page the backend has processed so far.
export default function SearchBar({ onSearch, results, onJump }) {
  const [query, setQuery] = useState("");
  const timerRef = useRef(null);

  const handleChange = (value) => {
    setQuery(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onSearch(value), 250);
  };

  const clear = () => {
    setQuery("");
    if (timerRef.current) clearTimeout(timerRef.current);
    onSearch("");
  };

  return (
    <div className="search-panel">
      <div className="search-input">
        <Search size={16} />
        <input
          type="text"
          value={query}
          placeholder="Search document…"
          onChange={(e) => handleChange(e.target.value)}
        />
        {query && (
          <button className="search-clear" onClick={clear} aria-label="Clear search">
            <X size={14} />
          </button>
        )}
      </div>

      {results !== null && (
        <div className="search-results">
          <div className="search-count">
            {results.length === 0 ? "No matches" : `${results.length} match${results.length > 1 ? "es" : ""}`}
          </div>
          <ul>
            {results.map((r, i) => (
              <li key={i} onClick={() => onJump(r)}>
                <span className="result-page">p.{r.page}</span>
                <span className="result-text">{r.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
