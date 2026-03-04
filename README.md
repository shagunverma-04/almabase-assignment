# RefineAI — Structured Questionnaire Answering Tool

> Automates vendor assessments, compliance forms, and security questionnaires using RAG (Retrieval-Augmented Generation) over your internal reference documents.

## Live Demo
[Insert Render/Railway URL here]

## GitHub
[Insert GitHub URL here]

---

## What I Built

A full-stack AI-powered tool that takes a structured questionnaire (PDF, DOCX, or TXT) and automatically answers every question using uploaded reference documents — with citations, evidence snippets, and confidence scores per answer.

**Fictional Company Used:**
- **Company:** NovaMed Systems
- **Industry:** Healthcare SaaS
- **Description:** NovaMed is a cloud-based electronic health records (EHR) platform serving mid-size hospitals and clinics across the US and EU. They regularly respond to vendor security assessments and compliance questionnaires from hospital procurement teams.

Sample questionnaire and reference documents are included in `/mock_data/`.

---

## Core Features

### Phase 1 — Core Workflow ✅
- User signup & login (JWT auth)
- Upload questionnaire (PDF / DOCX / TXT)
- Upload 1–8 reference documents (PDF / DOCX / TXT)
- Parse questionnaire into individual questions
- RAG pipeline: chunk → embed (Gemini text-embedding-004) → cosine similarity retrieval → LLM answer generation (Gemini 2.0 Flash)
- `"Not found in references."` returned when no relevant content found
- Citations attached per answer

### Phase 2 — Review & Export ✅
- Review all answers in a structured web view
- Edit any answer inline before export
- Export full answered questionnaire as DOCX (preserves question structure)

### Nice-to-Have Features ✅
- **Confidence Score** — 0–100% confidence per answer based on retrieval quality
- **Evidence Snippets** — exact quote from source document shown per answer
- **Partial Regeneration** — regenerate any individual answer without reprocessing the whole questionnaire
- **Coverage Summary** — total questions / answered / not found shown in session header

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI (Python) |
| Frontend | React 18 + Vite |
| Database | SQLite (via SQLAlchemy) |
| LLM | Gemini 2.0 Flash |
| Embeddings | Gemini text-embedding-004 |
| Auth | JWT (python-jose + passlib bcrypt) |
| Export | python-docx |
| File Parsing | pdfplumber (PDF), python-docx (DOCX) |

---

## RAG Pipeline

```
User Question
     ↓
Query Embedding (text-embedding-004, retrieval_query task)
     ↓
Chunk Reference Docs (400 words, 80 word overlap)
     ↓
Embed All Chunks (text-embedding-004, retrieval_document task)
     ↓
Cosine Similarity Ranking → Top 4 Chunks
     ↓
Gemini 2.0 Flash: Answer + Citation + Evidence + Confidence
     ↓
Store in PostgreSQL → Serve to UI
```

---

## Setup & Running Locally

### Prerequisites
- Python 3.10+
- Node.js 18+
- Gemini API key (free at https://aistudio.google.com)

### Backend

```bash
cd backend
pip install -r requirements.txt
export GEMINI_API_KEY=your_key_here
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# Runs at http://localhost:3000
```

### Try It With Mock Data

1. Sign up at http://localhost:3000
2. Go to **References** → upload `mock_data/security_policy.txt` and `mock_data/infrastructure_sla.txt`
3. Go to **New Session** → upload `mock_data/questionnaire.txt`
4. Click **Generate Answers**
5. Review answers, edit if needed, export DOCX

---

## Assumptions

- Questions are numbered (e.g., `1.`, `1)`, `Q1.`) or end with `?` — the parser uses these heuristics to split the questionnaire
- Reference documents are plain text, PDF, or DOCX — no image-based PDFs (OCR not implemented)
- SQLite used for simplicity; swap `DATABASE_URL` for PostgreSQL in production
- Embeddings are generated at query time (not pre-cached) — acceptable latency for this scale
- One user's reference documents are shared across all their sessions (per-session doc scoping is a future improvement)

---

## Trade-offs

| Decision | Trade-off |
|---|---|
| SQLite over PostgreSQL | Simpler setup, no pgvector — but cosine similarity computed in Python instead of DB |
| In-memory embeddings | No vector store needed, simpler architecture — but slower at scale (100+ docs) |
| Gemini free tier | No cost, but rate-limited — added basic try/except for rate limit handling |
| BackgroundTasks over Celery | Simpler deployment, single process — fine for sequential processing, not for concurrent jobs |
| Chunk size 400 words | Balances context (too small = fragmented answers) vs precision (too large = noise in retrieval) |

---

## What I'd Improve With More Time

1. **Vector DB** — replace in-Python cosine similarity with pgvector or Qdrant for faster retrieval at scale
2. **Async embedding** — parallelize chunk embedding with asyncio for faster processing
3. **Per-session reference documents** — currently all user docs are used; scoping per session gives more control
4. **OCR support** — handle scanned PDFs using Tesseract
5. **Version history** — save multiple runs of the same questionnaire for comparison
6. **Streaming answers** — stream LLM responses per question so users see results as they come in, not all at once
7. **Better question parsing** — current heuristic parser is good but an LLM-based question extractor would handle edge cases better
8. **Production auth** — add email verification, password reset, refresh tokens

---

## Project Structure

```
questionnaire-tool/
├── backend/
│   ├── main.py              # FastAPI app
│   ├── database.py          # SQLAlchemy models
│   ├── auth_utils.py        # JWT auth
│   ├── file_parser.py       # PDF/DOCX/TXT parsing + question extraction
│   ├── rag_engine.py        # Gemini embeddings + retrieval + answer generation
│   ├── exporter.py          # DOCX export
│   ├── requirements.txt
│   └── routers/
│       ├── auth.py
│       ├── documents.py
│       └── questionnaire.py
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # All UI components
│   │   └── main.jsx
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
└── mock_data/
    ├── questionnaire.txt
    ├── security_policy.txt
    └── infrastructure_sla.txt
```
