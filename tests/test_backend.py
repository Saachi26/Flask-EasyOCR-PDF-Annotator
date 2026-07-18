"""
Backend tests. These deliberately avoid loading the OCR model where possible:
digital (text-layer) PDFs exercise render + fast-path + cache without torch.

Run:  pytest -q
"""

import os
import tempfile

import pytest

import pipeline
import server


@pytest.fixture()
def workspace(tmp_path, monkeypatch):
    """Point the pipeline's storage at a temp dir for isolation."""
    monkeypatch.setattr(pipeline, "UPLOAD_FOLDER", str(tmp_path))
    return tmp_path


def _make_text_pdf(path, pages=2, text="Hello searchable world OCR annotator test"):
    """Create a digital PDF with a real text layer (no OCR needed to read it)."""
    import fitz
    doc = fitz.open()
    for _ in range(pages):
        page = doc.new_page()
        page.insert_text((72, 72), text, fontsize=14)
    doc.save(path)
    doc.close()


# --- pure validation ---------------------------------------------------------
def test_allowed_extension():
    assert server._allowed("scan.pdf")
    assert server._allowed("SCAN.PDF")
    assert not server._allowed("evil.exe")
    assert not server._allowed("noext")


def test_change_page_rejects_bad_input():
    client = server.app.test_client()
    r = client.post("/change-page", json={"filename": "x.pdf", "page": "abc"})
    assert r.status_code == 400


def test_get_image_blocks_path_traversal():
    client = server.app.test_client()
    r = client.get("/get-image/..%2f..%2fserver.py")
    assert r.status_code in (403, 404)  # never serves a file outside uploads/


# --- fast path: digital PDF is read from its text layer, not OCR'd -----------
def test_digital_pdf_uses_embedded_fast_path(workspace):
    pdf = os.path.join(str(workspace), "doc.pdf")
    _make_text_pdf(pdf)

    payload = pipeline.process_page("doc.pdf", 1)
    assert payload["source"] == "embedded"          # no OCR happened
    assert payload["total_pages"] == 2
    assert any("searchable" in b["text"].lower() for b in payload["ocr_data"])
    # image + json caches were written
    img, js = pipeline._page_paths("doc.pdf", 1)
    assert os.path.exists(img) and os.path.exists(js)


def test_second_call_is_served_from_cache(workspace):
    pdf = os.path.join(str(workspace), "doc.pdf")
    _make_text_pdf(pdf, pages=1)
    first = pipeline.process_page("doc.pdf", 1)
    # Remove the source PDF; a cache hit must still succeed.
    os.remove(pdf)
    with pytest.raises(Exception):
        pipeline.get_page_count("doc.pdf")           # sanity: pdf really gone
    second = pipeline.process_page("doc.pdf", 1)
    assert second["ocr_data"] == first["ocr_data"]


def test_search_across_pages(workspace):
    pdf = os.path.join(str(workspace), "doc.pdf")
    _make_text_pdf(pdf, pages=3, text="unique_token_xyz appears here")
    for p in (1, 2, 3):
        pipeline.process_page("doc.pdf", p)
    hits = pipeline.search("doc.pdf", "unique_token_xyz")
    assert len(hits) >= 3
    assert {h["page"] for h in hits} == {1, 2, 3}
    assert all("page" in h and "x" in h for h in hits)


def test_invalidate_clears_cache(workspace):
    pdf = os.path.join(str(workspace), "doc.pdf")
    _make_text_pdf(pdf, pages=1)
    pipeline.process_page("doc.pdf", 1)
    img, js = pipeline._page_paths("doc.pdf", 1)
    assert os.path.exists(js)
    pipeline.invalidate("doc.pdf")
    assert not os.path.exists(js) and not os.path.exists(img)
