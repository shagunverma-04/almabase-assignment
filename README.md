# RefineAI — Structured Questionnaire Answering Tool

> Automates vendor assessments, compliance forms, and security questionnaires using RAG (Retrieval-Augmented Generation) over your internal reference documents.

## Live Demo
https://almabase-assignment-live.onrender.com

## GitHub
https://github.com/shagunverma-04/almabase-assignment

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
- RAG pipeline: chunk → embed locally (fastembed ONNX, no API) → cosine similarity retrieval → LLM answer generation (Groq / Llama 3.1 8B)
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
| LLM | Groq API — Llama 3.1 8B Instant |
| Embeddings | fastembed — BAAI/bge-small-en-v1.5 (local ONNX, no API) |
| Auth | JWT (python-jose + bcrypt) |
| Export | python-docx |
| File Parsing | pdfplumber (PDF), python-docx (DOCX) |
| Deployment | Render (backend: Web Service, frontend: Static Site) |

---

### Try It With Mock Data

1. Sign up at http://localhost:3000
2. Go to **References** → upload all files from `mock_data/` except `questionnaire_short.txt`
3. Go to **New Session** → upload `mock_data/questionnaire_short.txt`
4. Click **Generate Answers**
5. Review answers, edit if needed, export DOCX

---

## Assumptions

- Questions are numbered (e.g., `1.`, `1)`, `Q1.`) or end with `?` — the parser uses these heuristics to split the questionnaire
- Reference documents are plain text, PDF, or DOCX — no image-based PDFs (OCR not implemented)
- SQLite used for simplicity; swap `DATABASE_URL` for PostgreSQL in production
- Embeddings are computed locally per request (not pre-cached) — acceptable latency at this scale
- One user's reference documents are shared across all their sessions (per-session doc scoping is a future improvement)

---

## Trade-offs

| Decision | Trade-off |
|---|---|
| SQLite over PostgreSQL | Simpler zero-config setup — but cosine similarity computed in Python instead of the DB, and on Render's free tier the SQLite file resets on each new deploy (ephemeral filesystem). Production would use PostgreSQL with pgvector. |
| Local ONNX embeddings (fastembed) over an embedding API | No API calls, no rate limits, no cost — but the model (~130 MB) must be downloaded on first run and runs on CPU, so it would be slower at scale (1000+ chunks). A hosted vector DB like Qdrant or Pinecone would replace this in production. |
| Groq free tier over OpenAI | No cost, very fast inference — but dependent on a third-party free tier. Production would use a paid, SLA-backed model API. |
| BackgroundTasks over Celery | Simpler single-process deployment — fine for sequential answer generation, but two users generating at the same time would queue. Celery + Redis would handle concurrency properly. |
| Chunk size 400 words / 80 overlap | Balances context richness vs retrieval precision — too small fragments answers, too large adds noise. A production system would tune this per document type. |
| Heuristic question parser | Simple regex covering numbered and `?`-terminated questions — works well for structured forms but an LLM-based extractor would handle edge cases (multi-line questions, tables, nested structure) better. |

---

## What I'd Improve With More Time

1. **PostgreSQL + pgvector** — replace SQLite + in-Python cosine similarity with a proper vector DB; persistent across deploys and orders of magnitude faster at scale
2. **Pre-compute and cache embeddings** — currently embeddings are recomputed per question per run; storing chunk embeddings in the DB after first upload would make generation much faster
3. **Per-session reference documents** — currently all of a user's reference docs are searched for every session; scoping docs per session gives more precise, less noisy retrieval
4. **Celery + Redis for background jobs** — replace FastAPI BackgroundTasks so concurrent users don't block each other's generation jobs
5. **OCR support** — handle scanned/image PDFs using Tesseract so the tool works on real-world vendor documents
6. **Streaming answers** — stream LLM tokens per question so users see progress in real time rather than waiting for all answers
7. **LLM-based question parser** — current regex heuristic handles 90% of cases; an LLM extractor would correctly handle multi-line questions, nested lists, and table-format questionnaires
8. **Production auth** — email verification, password reset, refresh tokens, and rate limiting on auth endpoints

---
