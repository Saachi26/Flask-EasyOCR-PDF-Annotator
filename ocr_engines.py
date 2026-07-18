"""
Pluggable OCR engines.

Every engine implements a single method, ``readtext(image)``, which takes a
NumPy image (BGR or grayscale) and returns a normalized list of word/line boxes:

    [{"text": str, "x": int, "y": int, "w": int, "h": int, "prob": float}, ...]

coordinates are in the pixel space of the image that was passed in.

Select the engine with the ``OCR_ENGINE`` environment variable:
    OCR_ENGINE=easyocr   (default)
    OCR_ENGINE=tesseract
    OCR_ENGINE=paddle
"""

import os
from abc import ABC, abstractmethod


def detect_gpu():
    """Use the GPU only when CUDA is actually available (avoids a hard crash on
    machines without an NVIDIA GPU, e.g. macOS). Override with EASYOCR_GPU."""
    override = os.environ.get("EASYOCR_GPU")
    if override is not None:
        return override.strip().lower() in ("1", "true", "yes", "on")
    try:
        import torch
        return torch.cuda.is_available()
    except Exception:
        return False


def select_device():
    """Pick the best available torch device: CUDA, then Apple Metal (MPS), then
    CPU. MPS gives a big speedup for TrOCR on Apple Silicon Macs."""
    try:
        import torch
        if torch.cuda.is_available():
            return "cuda"
        mps = getattr(torch.backends, "mps", None)
        if mps is not None and mps.is_available():
            return "mps"
    except Exception:
        pass
    return "cpu"


class OCREngine(ABC):
    """Common interface so the rest of the app never depends on a specific OCR lib."""

    name = "base"
    # Whether the pipeline should apply its grayscale/denoise preprocessing before
    # calling readtext(). Deep-learning recognizers (TrOCR) do better on raw input.
    preprocess = True

    @abstractmethod
    def readtext(self, image):
        """Return a list of normalized box dicts (see module docstring)."""
        raise NotImplementedError


class EasyOCREngine(OCREngine):
    """Deep-learning OCR (PyTorch). Pure-pip, strong on messy scans, GPU-optional."""

    name = "easyocr"

    def __init__(self, languages=None, gpu=None):
        import easyocr
        gpu = detect_gpu() if gpu is None else gpu
        self.gpu = gpu
        self.reader = easyocr.Reader(languages or ["en"], gpu=gpu)

    def readtext(self, image):
        results = self.reader.readtext(image, detail=1, paragraph=False)
        boxes = []
        for bbox, text, prob in results:
            text = (text or "").strip()
            if not text:
                continue
            xs = [p[0] for p in bbox]
            ys = [p[1] for p in bbox]
            x, y = int(min(xs)), int(min(ys))
            # Axis-aligned bounding box from the (possibly skewed) quad — correct
            # even for slightly rotated text, unlike the old tl/tr assumption.
            boxes.append({
                "text": text,
                "x": x,
                "y": y,
                "w": int(max(xs) - min(xs)),
                "h": int(max(ys) - min(ys)),
                "prob": float(prob),
            })
        return boxes


class TesseractEngine(OCREngine):
    """Classic engine. Fast on CPU; needs the `tesseract` system binary installed."""

    name = "tesseract"

    def __init__(self, lang="eng"):
        import pytesseract
        from pytesseract import Output
        self._pt = pytesseract
        self._Output = Output
        self._lang = lang

    def readtext(self, image):
        data = self._pt.image_to_data(image, lang=self._lang, output_type=self._Output.DICT)
        boxes = []
        for i in range(len(data["text"])):
            text = (data["text"][i] or "").strip()
            try:
                conf = float(data["conf"][i])
            except (TypeError, ValueError):
                conf = -1.0
            if not text or conf < 0:
                continue
            boxes.append({
                "text": text,
                "x": int(data["left"][i]),
                "y": int(data["top"][i]),
                "w": int(data["width"][i]),
                "h": int(data["height"][i]),
                "prob": conf / 100.0,
            })
        return boxes


class PaddleEngine(OCREngine):
    """Baidu PaddleOCR. Strong accuracy + speed; heavier, finicky install."""

    name = "paddle"

    def __init__(self, lang="en"):
        from paddleocr import PaddleOCR
        self._ocr = PaddleOCR(use_angle_cls=True, lang=lang, show_log=False)

    def readtext(self, image):
        result = self._ocr.ocr(image, cls=True)
        boxes = []
        for line in (result[0] or []):
            quad, (text, prob) = line
            text = (text or "").strip()
            if not text:
                continue
            xs = [p[0] for p in quad]
            ys = [p[1] for p in quad]
            boxes.append({
                "text": text,
                "x": int(min(xs)),
                "y": int(min(ys)),
                "w": int(max(xs) - min(xs)),
                "h": int(max(ys) - min(ys)),
                "prob": float(prob),
            })
        return boxes


class TrOCREngine(OCREngine):
    """Handwriting-capable OCR.

    TrOCR only *recognizes* a cropped line — it can't locate text on a page — so
    this uses EasyOCR's detector to find text-line boxes, then runs Microsoft's
    TrOCR transformer on each crop. Far better on handwriting than EasyOCR's own
    recognizer, but slower (a transformer pass per line) — use a GPU or short
    documents. Model via TROCR_MODEL (default: microsoft/trocr-base-handwritten).
    """

    name = "trocr"
    preprocess = False  # TrOCR wants raw crops, not denoised/binarized input

    def __init__(self, model=None):
        import easyocr
        import torch
        from transformers import TrOCRProcessor, VisionEncoderDecoderModel

        self._torch = torch
        self._batch = int(os.environ.get("TROCR_BATCH", "8"))
        self._max_new_tokens = int(os.environ.get("TROCR_MAX_TOKENS", "48"))
        self._device = select_device()  # CUDA → Apple MPS → CPU

        # EasyOCR provides detection-only boxes; TrOCR does the recognition.
        self._detector = easyocr.Reader(["en"], gpu=(self._device == "cuda"))
        model = model or os.environ.get("TROCR_MODEL", "microsoft/trocr-base-handwritten")
        self._processor = TrOCRProcessor.from_pretrained(model)
        self._model = VisionEncoderDecoderModel.from_pretrained(model).eval().to(self._device)

    def _detect_boxes(self, image):
        horizontal, free = self._detector.detect(image)
        boxes = []
        for (x_min, x_max, y_min, y_max) in (horizontal[0] if horizontal else []):
            boxes.append((int(x_min), int(y_min), int(x_max), int(y_max)))
        for quad in (free[0] if free else []):
            xs = [p[0] for p in quad]
            ys = [p[1] for p in quad]
            boxes.append((int(min(xs)), int(min(ys)), int(max(xs)), int(max(ys))))
        return boxes

    def readtext(self, image):
        from PIL import Image

        h, w = image.shape[:2]
        crops, coords = [], []
        for (x0, y0, x1, y1) in self._detect_boxes(image):
            x0, y0 = max(0, x0), max(0, y0)
            x1, y1 = min(w, x1), min(h, y1)
            if x1 - x0 < 3 or y1 - y0 < 3:
                continue
            crop = image[y0:y1, x0:x1]
            rgb = crop if crop.ndim == 3 else crop[:, :, None].repeat(3, axis=2)
            crops.append(Image.fromarray(rgb[:, :, ::-1]).convert("RGB"))  # BGR->RGB
            coords.append((x0, y0, x1 - x0, y1 - y0))

        results = []
        for start in range(0, len(crops), self._batch):
            batch = crops[start:start + self._batch]
            pixel_values = self._processor(images=batch, return_tensors="pt").pixel_values.to(self._device)
            with self._torch.no_grad():
                generated = self._model.generate(pixel_values, max_new_tokens=self._max_new_tokens)
            texts = self._processor.batch_decode(generated, skip_special_tokens=True)
            for j, text in enumerate(texts):
                text = (text or "").strip()
                if not text:
                    continue
                x, y, bw, bh = coords[start + j]
                results.append({"text": text, "x": x, "y": y, "w": bw, "h": bh, "prob": 1.0})
        return results


_ENGINES = {
    "easyocr": EasyOCREngine,
    "tesseract": TesseractEngine,
    "paddle": PaddleEngine,
    "trocr": TrOCREngine,
}


def create_engine(name=None):
    """Instantiate the configured OCR engine. Loads its heavy deps lazily, so
    installing only the engine you use is enough."""
    name = (name or os.environ.get("OCR_ENGINE") or "easyocr").strip().lower()
    if name not in _ENGINES:
        raise ValueError(
            f"Unknown OCR_ENGINE '{name}'. Options: {', '.join(_ENGINES)}"
        )
    return _ENGINES[name]()
