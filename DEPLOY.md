# Deploying the live demo (Hugging Face Spaces)

The app ships as a **single Docker container**: the React frontend is built to
static files and served by Flask alongside the API on one port (`7860`), so it
runs anywhere a Dockerfile does — including a free Hugging Face Space.

## Steps

1. **Create the Space**
   - Go to <https://huggingface.co/new-space>
   - **SDK:** Docker → *Blank*
   - **Hardware:** CPU basic (free)

2. **Add the Space metadata.** Hugging Face reads a YAML header at the top of
   `README.md`. Either add this block to the top of your README *on the Space
   repo*, or keep a separate README there:

   ```yaml
   ---
   title: DocuLens
   emoji: 📄
   colorFrom: indigo
   colorTo: purple
   sdk: docker
   app_port: 7860
   pinned: false
   ---
   ```

3. **Push the code to the Space**
   ```bash
   git remote add space https://huggingface.co/spaces/<your-username>/doculens
   git push space main
   ```
   (Or clone the empty Space repo and copy the project files in.)

4. **Wait for the build.** The first build installs PyTorch + downloads the
   EasyOCR models (baked into the image), so it takes a few minutes. Subsequent
   builds are cached.

## Notes

- **CPU-only:** the free tier has no GPU, so *scanned* pages OCR at a few seconds
  each. The digital-text fast path + caching keep normal PDFs instant, and the
  background worker warms the rest while the user reads page 1.
- **Ephemeral storage:** Spaces reset the filesystem on restart, so the
  `uploads/` cache is not permanent there — fine for a demo.
- **Run it the same way locally:** `docker compose up --build` → open
  <http://localhost:7860>.
