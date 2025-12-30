from flask import Flask, request, jsonify, render_template, send_file
from flask_cors import CORS
import easyocr
import numpy as np
import cv2
import os
from pdf2image import convert_from_path, pdfinfo_from_path
from werkzeug.utils import secure_filename

app = Flask(__name__, template_folder='templates', static_folder='static')
CORS(app)

UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

print("⏳ Loading AI Brain...")
reader = easyocr.Reader(['en'], gpu=True)
print("✅ AI Model Loaded!")

# --- MEMORY CACHE ---
OCR_CACHE = {}

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_pdf():
    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    
    file = request.files['file']
    filename = secure_filename(file.filename)
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(filepath)
    
    # Process Page 1
    return process_page(filename, filepath, 1)

@app.route('/change-page', methods=['POST'])
def change_page():
    data = request.json
    filename = data.get('filename')
    page_num = data.get('page')
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    
    return process_page(filename, filepath, page_num)

def process_page(filename, filepath, page_num):
    """
    Standardized Page Processor
    """
    # 1.GET TOTAL PAGES
    try:
        info = pdfinfo_from_path(filepath)
        total_pages = info["Pages"]
    except:
        return jsonify({"error": "Invalid PDF or Poppler not installed"}), 500

    # Safety Check: Prevent going out of bounds
    if page_num < 1: page_num = 1
    if page_num > total_pages: page_num = total_pages

    cache_key = f"{filename}_page{page_num}"
    image_filename = f"{filename}_page{page_num}.jpg"
    image_path = os.path.join(app.config['UPLOAD_FOLDER'], image_filename)
    
    # 2. GENERATE IMAGE
    if not os.path.exists(image_path):
        images = convert_from_path(filepath, dpi=150, first_page=page_num, last_page=page_num)
        if not images: return jsonify({"error": "Page not found"}), 404
        images[0].save(image_path, 'JPEG')
        width, height = images[0].size
    else:
        img = cv2.imread(image_path)
        height, width, _ = img.shape

    # 3. RUN OCR
    if cache_key in OCR_CACHE:
        print(f"⚡ Using Cached OCR for Page {page_num}")
        ocr_data = OCR_CACHE[cache_key]
    else:
        print(f"🤖 Running AI on Page {page_num}...")
        img = cv2.imread(image_path)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        results = reader.readtext(gray, detail=1, paragraph=False)
        
        ocr_data = []
        for (bbox, text, prob) in results:
            if prob > 0.3: 
                (tl, tr, br, bl) = bbox
                ocr_data.append({
                    "text": text,
                    "x": int(tl[0]),
                    "y": int(tl[1]),
                    "w": int(tr[0] - tl[0]),
                    "h": int(bl[1] - tl[1])
                })
        
        OCR_CACHE[cache_key] = ocr_data

    return jsonify({
        "success": True, 
        "image_url": f"/get-image/{image_filename}",
        "ocr_data": ocr_data, 
        "width": width,       
        "height": height,     
        "current_page": page_num,
        "total_pages": total_pages,
        "filename": filename
    })

@app.route('/get-image/<filename>')
def get_image(filename):
    return send_file(os.path.join(app.config['UPLOAD_FOLDER'], filename))

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5002, debug=True)