import os
import json
import re
import numpy as np
from typing import List
from dotenv import load_dotenv
from fastembed import TextEmbedding
from groq import Groq

load_dotenv()

# Load ONNX embedding model once at startup — no TensorFlow, no Keras conflicts
_embed_model = TextEmbedding("BAAI/bge-small-en-v1.5")


def get_groq_client() -> Groq:
    api_key = os.environ.get("GROQ_API_KEY", "")
    if not api_key:
        raise ValueError("GROQ_API_KEY is not set. Add it to backend/.env")
    return Groq(api_key=api_key)


def get_embedding(text: str) -> List[float]:
    """Embed a chunk locally using ONNX — no API, no rate limits."""
    return list(_embed_model.embed([text]))[0].tolist()


def get_query_embedding(text: str) -> List[float]:
    """Embed a query locally."""
    return list(_embed_model.embed([text]))[0].tolist()


def cosine_similarity(a: List[float], b: List[float]) -> float:
    a, b = np.array(a), np.array(b)
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-10))


def chunk_text(text: str, chunk_size: int = 400, overlap: int = 80) -> List[str]:
    words = text.split()
    chunks = []
    i = 0
    while i < len(words):
        chunk = " ".join(words[i:i + chunk_size])
        chunks.append(chunk)
        i += chunk_size - overlap
    return chunks


def retrieve_relevant_chunks(
    query: str,
    documents: List[dict],
    top_k: int = 3
) -> List[dict]:
    """Retrieve top_k relevant chunks using local ONNX embeddings."""
    query_emb = get_query_embedding(query)

    all_chunks = []
    for doc in documents:
        for chunk in chunk_text(doc["content"]):
            all_chunks.append({"filename": doc["filename"], "text": chunk})

    if not all_chunks:
        return []

    scored = []
    for chunk in all_chunks:
        emb = get_embedding(chunk["text"])
        score = cosine_similarity(query_emb, emb)
        scored.append({**chunk, "score": score})

    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:top_k]


_PLACEHOLDER_QUESTIONS = {
    "", "no question", "n/a", "na", "none", "-", "--", "tbd", "n.a.", "not applicable",
}

def answer_question(
    question: str,
    relevant_chunks: List[dict]
) -> dict:
    """Generate answer with citation and confidence using Groq (Llama 3)."""
    _not_found = {
        "answer": "Not found in references.",
        "citations": [],
        "evidence_snippets": [],
        "confidence": 0.0,
    }

    # Short-circuit for empty or placeholder questions
    if not question or question.strip().lower() in _PLACEHOLDER_QUESTIONS:
        return {
            "answer": "No reference context.",
            "citations": [],
            "evidence_snippets": [],
            "confidence": 0.0,
        }

    if not relevant_chunks:
        return _not_found

    context_parts = []
    for i, chunk in enumerate(relevant_chunks):
        context_parts.append(f"[Source {i+1}: {chunk['filename']}]\n{chunk['text']}")
    context = "\n\n---\n\n".join(context_parts)

    prompt = f"""You are a compliance assistant answering questions strictly from the provided reference documents.

STRICT RULES:
1. Use ONLY the text in the REFERENCE DOCUMENTS below. Do NOT use any outside knowledge.
2. If the answer cannot be found in the documents, you MUST respond with exactly: "Not found in references."
3. Never invent, guess, or paraphrase beyond what the documents say.
4. Never say things like "Based on general knowledge" or "Typically...".

REFERENCE DOCUMENTS:
{context}

QUESTION: {question}

Assign a confidence score 0.0-1.0:
- 0.9-1.0: Direct, explicit answer found word-for-word
- 0.6-0.8: Answer clearly supported by documents
- 0.3-0.5: Partial or indirect support only
- 0.0: Not supported — use "Not found in references."

Respond ONLY in this exact JSON format (no markdown, no extra text):
{{
  "answer": "your answer here",
  "citations": ["Source 1: filename.txt", "Source 2: filename.txt"],
  "evidence_snippets": ["exact short quote from source 1", "exact short quote from source 2"],
  "confidence": 0.85
}}"""

    try:
        client = get_groq_client()
        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=2048,
        )
        text = response.choices[0].message.content.strip()
        text = re.sub(r'^```json\s*', '', text)
        text = re.sub(r'^```\s*', '', text)
        text = re.sub(r'\s*```$', '', text)
        result = json.loads(text)
        if "not found" in result.get("answer", "").lower():
            return _not_found
        return result
    except Exception as e:
        print(f"[answer_question error] {e}")
        return _not_found
