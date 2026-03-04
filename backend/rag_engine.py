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
    top_k: int = 4
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


def answer_question(
    question: str,
    relevant_chunks: List[dict]
) -> dict:
    """Generate answer with citation and confidence using Groq (Llama 3)."""
    if not relevant_chunks:
        return {
            "answer": "Not found in references.",
            "citations": [],
            "evidence_snippets": [],
            "confidence": 0.0
        }

    context_parts = []
    for i, chunk in enumerate(relevant_chunks):
        context_parts.append(f"[Source {i+1}: {chunk['filename']}]\n{chunk['text']}")
    context = "\n\n---\n\n".join(context_parts)

    prompt = f"""You are answering questions for a company using ONLY the provided reference documents.

REFERENCE DOCUMENTS:
{context}

QUESTION: {question}

Instructions:
- Answer using ONLY information from the reference documents above
- If the answer is not in the documents, respond with exactly: "Not found in references."
- Be concise and precise
- Assign a confidence score 0.0-1.0 based on how well the documents support your answer
  - 0.9-1.0: Direct, explicit answer found
  - 0.6-0.8: Answer can be inferred from documents
  - 0.3-0.5: Partial or indirect support
  - 0.0-0.2: Not supported

Respond ONLY in this JSON format (no markdown, no extra text):
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
        )
        text = response.choices[0].message.content.strip()
        text = re.sub(r'^```json\s*', '', text)
        text = re.sub(r'^```\s*', '', text)
        text = re.sub(r'\s*```$', '', text)
        result = json.loads(text)
        if "not found" in result.get("answer", "").lower():
            result["answer"] = "Not found in references."
            result["confidence"] = 0.0
            result["citations"] = []
            result["evidence_snippets"] = []
        return result
    except Exception as e:
        print(f"[answer_question error] {e}")
        best_score = max([c.get("score", 0) for c in relevant_chunks], default=0)
        if best_score < 0.3:
            return {
                "answer": "Not found in references.",
                "citations": [],
                "evidence_snippets": [],
                "confidence": 0.0
            }
        return {
            "answer": f"Based on available documents: {relevant_chunks[0]['text'][:300]}",
            "citations": [f"Source: {relevant_chunks[0]['filename']}"],
            "evidence_snippets": [relevant_chunks[0]['text'][:150]],
            "confidence": round(best_score, 2)
        }
