import re
from typing import List


def parse_file(content_bytes: bytes, filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower()

    if ext == "txt":
        return content_bytes.decode("utf-8", errors="ignore")

    elif ext == "pdf":
        import pdfplumber
        import io
        with pdfplumber.open(io.BytesIO(content_bytes)) as pdf:
            pages = [page.extract_text() or "" for page in pdf.pages]
        return "\n".join(pages)

    elif ext == "docx":
        from docx import Document
        import io
        doc = Document(io.BytesIO(content_bytes))
        return "\n".join(p.text for p in doc.paragraphs)

    # Fallback: try UTF-8
    return content_bytes.decode("utf-8", errors="ignore")


def extract_questions(text: str) -> List[str]:
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    questions = []

    # Match numbered patterns: "1.", "1)", "Q1.", "Q1:", "Question 1:"
    numbered = re.compile(
        r'^(?:Question\s*)?(?:Q\s*)?(\d+)[.):\s]+(.+)',
        re.IGNORECASE
    )

    for line in lines:
        m = numbered.match(line)
        if m:
            q = m.group(2).strip()
            if len(q) > 5:
                questions.append(q)
        elif line.endswith("?") and len(line) > 15:
            questions.append(line)

    # Deduplicate while preserving order
    seen = set()
    result = []
    for q in questions:
        if q not in seen:
            seen.add(q)
            result.append(q)

    # Fallback: treat each non-empty line as a question (cap at 15)
    if not result:
        result = [l for l in lines if len(l) > 10][:15]

    return result
