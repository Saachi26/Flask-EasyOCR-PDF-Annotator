"""
Document processing pipeline.

Responsibilities:
  * Render PDF pages to images with PyMuPDF (no poppler system dependency).
  * "Right tool per page": if a page already has an embedded text layer, extract
    it directly (instant, 100% accurate). Only fall back to OCR for real scans.
  * Cache every page's text + image to disk, so a page is processed once, ever.
  * Run a background worker that processes the whole document while the user
    reads page 1, exposing live progress.
  * Search across all processed pages.

Everything is keyed by the (sanitized) uploaded filename.
"""

import os
import json
import threading

import cv2
import numpy as np
import fitz  # PyMuPDF

import ocr_engines

UPLOAD_FOLDER = os.path.abspath(os.environ.get("UPLOAD_FOLDER", "uploads"))
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# --- Tunables (env-overridable) ---
RENDER_DPI = int(os.environ.get("RENDER_DPI", "220"))       # 300 = sharper, slower
OCR_MIN_CONF = float(os.environ.get("OCR_MIN_CONF", "0.3"))  # drop low-confidence junk
MIN_EMBEDDED_WORDS = int(os.environ.get("MIN_EMBEDDED_WORDS", "3"))  # digital vs scan
MAX_PAGES = int(os.environ.get("MAX_PAGES", "300"))
THUMB_WIDTH = int(os.environ.get("THUMB_WIDTH", "200"))  # sidebar preview width (px)

# --- Engine + concurrency ---
# The OCR model is loaded once (lazily) and its readtext() is serialized, since
# the underlying models are not thread-safe. Everything else can run concurrently.
_engine = None
_engine_lock = threading.Lock()
_ocr_lock = threading.Lock()

# --- Background job progress: filename -> {total, processed, embedded, ocr, done, error} ---
JOBS = {}
JOBS_LOCK = threading.Lock()


def get_engine():
    global _engine
    if _engine is None:
        with _engine_lock:
            if _engine is None:
                _engine = ocr_engines.create_engine()
    return _engine


# ---------------------------------------------------------------------------
# Paths / small IO helpers
# ---------------------------------------------------------------------------
def _pdf_path(filename):
    return os.path.join(UPLOAD_FOLDER, filename)


def _page_paths(filename, page_num):
    base = f"{filename}_page{page_num}"
    return (
        os.path.join(UPLOAD_FOLDER, base + ".jpg"),
        os.path.join(UPLOAD_FOLDER, base + ".json"),
    )


def _load_json(path):
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def _save_json(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(data, fh)
    os.replace(tmp, path)  # atomic — never leaves a half-written cache file


def invalidate(filename):
    """Drop cached pages/images/jobs for a filename (used before re-upload)."""
    with JOBS_LOCK:
        JOBS.pop(filename, None)
    for name in os.listdir(UPLOAD_FOLDER):
        is_page = name.startswith(f"{filename}_page")
        is_thumb = name.startswith(f"{filename}_thumb")
        if (is_page or is_thumb) and (name.endswith(".jpg") or name.endswith(".json")):
            try:
                os.remove(os.path.join(UPLOAD_FOLDER, name))
            except OSError:
                pass


# ---------------------------------------------------------------------------
# Rendering + text extraction
# ---------------------------------------------------------------------------
def _render_page(page, img_path):
    """Render a fitz page to a BGR image, save as JPEG, return (width, height)."""
    zoom = RENDER_DPI / 72.0
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom))
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
    if pix.n == 4:
        img = cv2.cvtColor(img, cv2.COLOR_RGBA2BGR)
    elif pix.n == 3:
        img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
    else:  # single channel
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    cv2.imwrite(img_path, img, [cv2.IMWRITE_JPEG_QUALITY, 90])
    return pix.width, pix.height


def _pixmap_to_bgr(pix):
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
    if pix.n == 4:
        return cv2.cvtColor(img, cv2.COLOR_RGBA2BGR)
    if pix.n == 3:
        return cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
    return cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)


def get_thumbnail(filename, page_num):
    """Return a path to a small cached preview image for the sidebar. Rendered at
    low resolution and independently of OCR, so previews appear immediately."""
    page_num = max(1, int(page_num))
    thumb_path = os.path.join(UPLOAD_FOLDER, f"{filename}_thumb{page_num}.jpg")
    if os.path.exists(thumb_path):
        return thumb_path

    with fitz.open(_pdf_path(filename)) as doc:
        page_num = min(page_num, doc.page_count)
        thumb_path = os.path.join(UPLOAD_FOLDER, f"{filename}_thumb{page_num}.jpg")
        if not os.path.exists(thumb_path):
            page = doc[page_num - 1]
            zoom = THUMB_WIDTH / page.rect.width
            pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom))
            cv2.imwrite(thumb_path, _pixmap_to_bgr(pix), [cv2.IMWRITE_JPEG_QUALITY, 80])
    return thumb_path


def _extract_embedded(page):
    """Return word boxes from a page's real text layer, scaled to render DPI.
    Empty list if the page has no meaningful embedded text (i.e. it's a scan)."""
    zoom = RENDER_DPI / 72.0
    boxes = []
    for (x0, y0, x1, y1, word, *_rest) in page.get_text("words"):
        text = (word or "").strip()
        if not text:
            continue
        boxes.append({
            "text": text,
            "x": int(x0 * zoom),
            "y": int(y0 * zoom),
            "w": int((x1 - x0) * zoom),
            "h": int((y1 - y0) * zoom),
            "prob": 1.0,
        })
    return boxes


def _preprocess_for_ocr(img_bgr):
    """Light, geometry-preserving cleanup for the OCR fallback. Grayscale + a
    gentle denoise; kept conservative so box coordinates stay aligned with the
    displayed image. Heavier steps (binarize/deskew) are intentionally omitted
    to avoid hurting the deep-learning engines or misaligning overlays."""
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    if os.environ.get("OCR_DENOISE", "1").strip().lower() in ("1", "true", "yes", "on"):
        gray = cv2.fastNlMeansDenoising(gray, h=10)
    return gray


def _process_uncached(filename, page_num, img_path):
    """Compute text for a page that isn't cached yet. Returns (boxes, source)."""
    with fitz.open(_pdf_path(filename)) as doc:
        page = doc[page_num - 1]
        if not os.path.exists(img_path):
            _render_page(page, img_path)
        embedded = _extract_embedded(page)

    if len(embedded) >= MIN_EMBEDDED_WORDS:
        return embedded, "embedded"  # digital PDF — no OCR needed

    # Real scan: OCR the rendered image. Deep-learning recognizers (e.g. TrOCR)
    # opt out of denoising via engine.preprocess and get the raw image instead.
    engine = get_engine()
    img = cv2.imread(img_path)
    proc = _preprocess_for_ocr(img) if getattr(engine, "preprocess", True) else img
    with _ocr_lock:
        results = engine.readtext(proc)
    boxes = [b for b in results if b.get("prob", 1.0) >= OCR_MIN_CONF]
    return boxes, "ocr"


# ---------------------------------------------------------------------------
# Public: process a single page (cache-first)
# ---------------------------------------------------------------------------
def get_page_count(filename):
    with fitz.open(_pdf_path(filename)) as doc:
        return doc.page_count


def _payload(filename, page_num, cached):
    return {
        "success": True,
        "image_url": f"/get-image/{filename}_page{page_num}.jpg",
        "ocr_data": cached["ocr_data"],
        "source": cached.get("source", "ocr"),   # "embedded" (fast path) or "ocr"
        "width": cached["width"],
        "height": cached["height"],
        "current_page": page_num,
        "total_pages": cached["total_pages"],
        "filename": filename,
    }


def process_page(filename, page_num):
    """Render + extract/OCR one page, using the disk cache when possible.
    A fully cached page is served without opening the source PDF at all.
    Returns the JSON-serializable payload for the API."""
    page_num = max(1, int(page_num))
    img_path, json_path = _page_paths(filename, page_num)

    # Fast path: exact page already cached — don't touch the source PDF.
    if os.path.exists(json_path) and os.path.exists(img_path):
        cached = _load_json(json_path)
        if "total_pages" in cached:
            return _payload(filename, page_num, cached)

    # Cache miss: open the PDF, clamp the page, and process it.
    total_pages = get_page_count(filename)
    page_num = max(1, min(page_num, total_pages))
    img_path, json_path = _page_paths(filename, page_num)

    if os.path.exists(json_path) and os.path.exists(img_path):
        cached = _load_json(json_path)
        cached.setdefault("total_pages", total_pages)
        return _payload(filename, page_num, cached)

    ocr_data, source = _process_uncached(filename, page_num, img_path)
    h, w = cv2.imread(img_path).shape[:2]
    cached = {
        "ocr_data": ocr_data, "source": source,
        "width": int(w), "height": int(h), "total_pages": total_pages,
    }
    _save_json(json_path, cached)
    return _payload(filename, page_num, cached)


# ---------------------------------------------------------------------------
# Background full-document processing + progress
# ---------------------------------------------------------------------------
def start_background_job(filename):
    """Kick off OCR of every page in a daemon thread so the user can start
    reading page 1 immediately while the rest processes."""
    try:
        total = get_page_count(filename)
    except Exception as e:
        with JOBS_LOCK:
            JOBS[filename] = {"total": 0, "processed": 0, "embedded": 0,
                              "ocr": 0, "done": True, "error": str(e)}
        return

    with JOBS_LOCK:
        JOBS[filename] = {"total": total, "processed": 0, "embedded": 0,
                          "ocr": 0, "done": False, "error": None}

    threading.Thread(target=_run_job, args=(filename, total), daemon=True).start()


def _run_job(filename, total):
    try:
        for page_num in range(1, total + 1):
            payload = process_page(filename, page_num)
            with JOBS_LOCK:
                job = JOBS.get(filename)
                if job is None:
                    return  # invalidated mid-run (e.g. re-upload)
                job["processed"] = page_num
                job[payload["source"]] = job.get(payload["source"], 0) + 1
        with JOBS_LOCK:
            if filename in JOBS:
                JOBS[filename]["done"] = True
    except Exception as e:
        with JOBS_LOCK:
            JOBS.setdefault(filename, {}).update({"done": True, "error": str(e)})


def get_status(filename):
    with JOBS_LOCK:
        job = JOBS.get(filename)
        return dict(job) if job else {"total": 0, "processed": 0, "done": False, "error": None}


# ---------------------------------------------------------------------------
# Search across all processed pages
# ---------------------------------------------------------------------------
def search(filename, query):
    query = (query or "").strip().lower()
    if not query:
        return []
    results = []
    prefix = f"{filename}_page"
    for name in os.listdir(UPLOAD_FOLDER):
        if not (name.startswith(prefix) and name.endswith(".json")):
            continue
        try:
            page_num = int(name[len(prefix):-len(".json")])
        except ValueError:
            continue
        try:
            data = _load_json(os.path.join(UPLOAD_FOLDER, name))
        except (OSError, json.JSONDecodeError):
            continue
        for box in data.get("ocr_data", []):
            if query in box["text"].lower():
                results.append({"page": page_num, **box})
    results.sort(key=lambda r: (r["page"], r["y"], r["x"]))
    return results
