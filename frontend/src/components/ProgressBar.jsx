import React from 'react';

// Shows background OCR progress. Hides itself once the whole document is done.
export default function ProgressBar({ status }) {
  if (!status || !status.total) return null;
  const { processed, total, done, error } = status;

  if (error) {
    return <div className="ocr-progress error">⚠️ Processing failed</div>;
  }
  if (done) return null;

  const pct = Math.round((processed / total) * 100);
  return (
    <div className="ocr-progress">
      <div className="ocr-progress-label">
        <span>🤖 Reading pages…</span>
        <span>{processed}/{total}</span>
      </div>
      <div className="ocr-progress-track">
        <div className="ocr-progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
