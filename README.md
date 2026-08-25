# Adiastematic Search Engine

A modern **Vite + React** search engine and interactive dashboard for exploring adiastematic chant contours across medieval and historical melody datasets.

## Features

- **Multi-Corpus Filtering**: Search across any subset of 6 medieval and historical datasets.
- **Exact & Fuzzy Search Engine**: Supports exact contour queries, Hamming distance, Levenshtein edit distance, and Subsequence matching.
- **Interactive Visualizations**: Real-time distribution charts (Chart.js) and 2D contour clustering maps computed via background **Web Worker PCA**.
- **Volpiano Notation**: Native Volpiano font rendering for melody strings.
- **GitHub Pages Ready**: Vite builds static output directly into `docs/` for instant serverless hosting.

---

## Project Structure

```
adiastematic_search/
├── build_corpus.py        # Data pipeline script (Python / pandas)
├── data/                  # Source CSV & Excel dataset files
├── public/                # Static assets (Volpiano fonts, logo, search_data.json)
├── src/                   # Vite + React source code
│   ├── components/        # React components (Controls, MultiSelect, ResultsGrid, StatsModal, etc.)
│   ├── utils/             # Search engine & matching algorithms
│   ├── workers/           # Web Worker for PCA clustering (pcaWorker.js)
│   ├── App.jsx            # Main dashboard container
│   ├── main.jsx           # React entrypoint
│   └── index.css          # Glassmorphic UI stylesheet & Volpiano font declarations
├── docs/                  # Vite production build output (GitHub Pages target)
├── scripts/
│   └── legacy/            # Archived legacy scripts
├── package.json           # npm dependencies & dev scripts
└── vite.config.js         # Vite build configuration
```

---

## Development & Usage

### 1. Rebuilding Corpus Data
To re-process raw CSV/Excel datasets from `data/` and update `search_data.json`:

```bash
npm run build-data
```

### 2. Local Development (with HMR)
To launch the Vite development server with instant Hot Module Replacement:

```bash
npm run dev
```

Then open `http://localhost:5173` in your browser.

### 3. Production Build for GitHub Pages
To compile the React app into `docs/`:

```bash
npm run build
```

The resulting files in `docs/` can be served locally using:

```bash
npm run preview
# OR
python -m http.server 8000 --directory docs
```


---
This tool was part-wise created with the help of Large Language Models.
