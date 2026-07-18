"""
Benchmark the processing pipeline on a real PDF.

Usage:
    python benchmark.py path/to/document.pdf

Prints per-page timing and whether each page used the embedded-text fast path
or the OCR fallback, plus totals. Copy the numbers straight into your README.
"""

import os
import sys
import time
import shutil


def main():
    if len(sys.argv) < 2:
        print("Usage: python benchmark.py path/to/document.pdf")
        sys.exit(1)

    src = sys.argv[1]
    if not os.path.exists(src):
        print(f"No such file: {src}")
        sys.exit(1)

    import pipeline  # imported after arg check so --help stays fast

    filename = os.path.basename(src)
    dest = os.path.join(pipeline.UPLOAD_FOLDER, filename)
    if os.path.abspath(src) != os.path.abspath(dest):
        shutil.copy(src, dest)
    pipeline.invalidate(filename)  # cold run — measure real work, not cache hits

    total_pages = pipeline.get_page_count(filename)
    print(f"\nDocument: {filename}  ({total_pages} pages)")
    print(f"Engine: {os.environ.get('OCR_ENGINE', 'easyocr')}   DPI: {pipeline.RENDER_DPI}\n")
    print(f"{'page':>4}  {'source':<9}  {'boxes':>6}  {'time':>8}")
    print("-" * 34)

    timings = {"embedded": [], "ocr": []}
    for page in range(1, total_pages + 1):
        t0 = time.perf_counter()
        payload = pipeline.process_page(filename, page)
        dt = time.perf_counter() - t0
        timings[payload["source"]].append(dt)
        print(f"{page:>4}  {payload['source']:<9}  {len(payload['ocr_data']):>6}  {dt*1000:>7.0f}ms")

    print("-" * 34)
    for source, times in timings.items():
        if times:
            avg = sum(times) / len(times) * 1000
            print(f"{source:<9}: {len(times):>3} pages, avg {avg:>6.0f} ms/page")
    grand = sum(sum(t) for t in timings.values())
    print(f"\nTotal cold processing time: {grand:.1f}s "
          f"({grand / total_pages * 1000:.0f} ms/page average)")
    print("Re-running is near-instant — every page is now cached to disk.\n")


if __name__ == "__main__":
    main()
