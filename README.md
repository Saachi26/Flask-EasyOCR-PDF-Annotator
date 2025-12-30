# 🎥 Flask-EasyOCR-PDF-Annotator

![Python](https://img.shields.io/badge/Python-3.8%2B-blue?style=for-the-badge&logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-2.0%2B-black?style=for-the-badge&logo=flask&logoColor=white)
![React](https://img.shields.io/badge/React-Vite-blue?style=for-the-badge&logo=react)
![EasyOCR](https://img.shields.io/badge/EasyOCR-Ready-green?style=for-the-badge)
![OpenCV](https://img.shields.io/badge/OpenCV-Computer%20Vision-red?style=for-the-badge&logo=opencv&logoColor=white)

---

 A full-stack intelligence system that turns scanned, non-selectable PDFs into interactive, searchable, and annotatable documents.

- Many PDFs are image-based scans
- Text cannot be selected, searched, or copied
- Highlighting and annotation are impossible
- These PDFs behave like static images rather than documents

---

## 🚀 Overview

Flask-EasyOCR-PDF-Annotator converts scanned PDFs into fully interactive documents.

Pipeline overview:

1. Upload scanned or image-based PDFs
2. Convert PDF pages to images using pdf2image
3. Extract text and bounding boxes with EasyOCR and OpenCV
4. Serve pages through a React-based viewer
5. Allow users to annotate, highlight, and interact with content

---

## 🛠️ Tech Stack

### Backend

- Python 3.8+
- Flask (API server)
- EasyOCR (PyTorch-based OCR)
- pdf2image (PDF to image conversion)
- OpenCV (image preprocessing)
- NumPy

### Frontend

- React (Vite)
- JSX
- HTML5 / CSS3
- Canvas API (pen, highlighter, eraser tools)
- Fetch API

---

## ⚡ Installation & Setup

Both backend and frontend are required.

---

## 🔹 Step 1: Prerequisites

Poppler is required for pdf2image.

### macOS (Homebrew)

    brew install poppler

### Windows

1. Download the latest Poppler binary for Windows
2. Extract the archive
3. Add the `bin` directory (for example: C:\Program Files\poppler-xx\bin) to your System PATH
4. Restart the terminal

---

## 🔹 Step 2: Clone the Repository

    git clone https://github.com/Saachi26/Flask-EasyOCR-PDF-Annotator.git
    cd Flask-EasyOCR-PDF-Annotator

---

## 🔹 Step 3: Backend Setup (Python)

Create and activate a virtual environment:

    python -m venv venv

Windows:

    venv\Scripts\activate

macOS / Linux:

    source venv/bin/activate

Install dependencies manually:

    pip install flask flask-cors easyocr opencv-python numpy pdf2image

Note:
- EasyOCR downloads OCR models on first run
- Initial execution may take a moment

---

## 🔹 Step 4: Frontend Setup (React + Vite)

Navigate to the frontend directory and install dependencies:

    cd frontend
    npm install

---

## ▶️ Running the Application

The project uses a single command to run both backend and frontend.

Ensure `concurrently` is installed:

    npm install concurrently --save-dev

Start both servers:

    npm run start

This runs:
- Flask backend on port 5002 using `server.py`
- React (Vite) frontend development server

---

## 🌐 Access the App

Open your browser at:

    http://localhost:5173

(Port may vary depending on Vite configuration)

---

## 🎮 How to Use

1. Upload
   - Select a scanned PDF using the upload interface

2. View
   - Pages load dynamically
   - Navigate using Next / Previous controls

3. Annotate
   - Pen: freehand notes
   - Highlighter: mark important sections
   - Eraser: remove annotations

4. Extract
   - OCR runs in the background
   - Text becomes readable and searchable

---

## 🤝 Contributing

- Pull requests are welcome
- Open an issue for major changes
- Keep commits clean and focused

---

## 📄 License

This project is licensed under the **MIT License**.  
See the `LICENSE` file for details.
