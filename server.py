"""
Flask API for the PDF annotator.

Thin routing layer — all document work lives in pipeline.py. The OCR engine is
loaded lazily on the first page that actually needs OCR, so startup is fast.
"""

import os

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename

import pipeline

# In production the built React app is served from here (single-origin deploy).
FRONTEND_DIST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend", "dist")

app = Flask(__name__, static_folder=FRONTEND_DIST, static_url_path="")
CORS(app)

# Reject oversized uploads early (default 50 MB).
app.config["MAX_CONTENT_LENGTH"] = int(os.environ.get("MAX_UPLOAD_MB", "50")) * 1024 * 1024

ALLOWED_EXTENSIONS = {".pdf"}


def _allowed(filename):
    return os.path.splitext(filename)[1].lower() in ALLOWED_EXTENSIONS


@app.route("/upload", methods=["POST"])
def upload_pdf():
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["file"]
    if not file.filename:
        return jsonify({"error": "Empty filename"}), 400

    filename = secure_filename(file.filename)
    if not filename or not _allowed(filename):
        return jsonify({"error": "Only PDF files are supported"}), 400

    filepath = os.path.join(pipeline.UPLOAD_FOLDER, filename)
    pipeline.invalidate(filename)          # clear stale cache before overwriting
    file.save(filepath)

    try:
        total = pipeline.get_page_count(filename)
    except Exception as e:
        print(f"⚠️ Could not open PDF: {e}")
        return jsonify({"error": "Invalid or corrupt PDF"}), 400
    if total > pipeline.MAX_PAGES:
        return jsonify({"error": f"PDF too long (max {pipeline.MAX_PAGES} pages)"}), 400

    try:
        payload = pipeline.process_page(filename, 1)
    except Exception as e:
        print(f"⚠️ Failed to process page 1: {e}")
        return jsonify({"error": "Failed to process PDF"}), 500

    # Process the rest of the document in the background while the user reads.
    pipeline.start_background_job(filename)
    return jsonify(payload)


@app.route("/change-page", methods=["POST"])
def change_page():
    data = request.get_json(silent=True) or {}
    filename = secure_filename(data.get("filename") or "")
    if not filename:
        return jsonify({"error": "Missing filename"}), 400

    try:
        page_num = int(data.get("page"))
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid page number"}), 400

    if not os.path.exists(os.path.join(pipeline.UPLOAD_FOLDER, filename)):
        return jsonify({"error": "File not found"}), 404

    try:
        return jsonify(pipeline.process_page(filename, page_num))
    except Exception as e:
        print(f"⚠️ Failed to process page: {e}")
        return jsonify({"error": "Failed to process page"}), 500


@app.route("/status", methods=["GET"])
def status():
    filename = secure_filename(request.args.get("filename") or "")
    if not filename:
        return jsonify({"error": "Missing filename"}), 400
    return jsonify(pipeline.get_status(filename))


@app.route("/search", methods=["POST"])
def search():
    data = request.get_json(silent=True) or {}
    filename = secure_filename(data.get("filename") or "")
    query = data.get("query") or ""
    if not filename:
        return jsonify({"error": "Missing filename"}), 400
    return jsonify({"results": pipeline.search(filename, query)})


@app.route("/get-image/<path:filename>")
def get_image(filename):
    # send_from_directory rejects paths that escape UPLOAD_FOLDER (no traversal).
    return send_from_directory(pipeline.UPLOAD_FOLDER, filename)


@app.route("/thumbnail/<path:filename>/<int:page>")
def thumbnail(filename, page):
    fn = secure_filename(filename)
    if not fn or not os.path.exists(os.path.join(pipeline.UPLOAD_FOLDER, fn)):
        return jsonify({"error": "File not found"}), 404
    try:
        path = pipeline.get_thumbnail(fn, page)
    except Exception as e:
        print(f"⚠️ Thumbnail failed: {e}")
        return jsonify({"error": "Failed to render thumbnail"}), 500
    return send_from_directory(pipeline.UPLOAD_FOLDER, os.path.basename(path))


@app.route("/health")
def health():
    return jsonify({"ok": True})


@app.route("/")
def index():
    # Serve the built SPA in production; in dev the Vite server handles the UI.
    if os.path.exists(os.path.join(FRONTEND_DIST, "index.html")):
        return send_from_directory(FRONTEND_DIST, "index.html")
    return jsonify({"ok": True, "message": "API running (frontend not built)"}), 200


if __name__ == "__main__":
    debug = os.environ.get("FLASK_DEBUG", "0").strip().lower() in ("1", "true", "yes", "on")
    port = int(os.environ.get("PORT", "5002"))
    app.run(host="0.0.0.0", port=port, debug=debug, threaded=True)
