import json
import traceback
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.responses import Response
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel

from database import SessionLocal, get_db, User, QuestionnaireSession, Answer, ReferenceDocument
from auth_utils import get_current_user
from file_parser import parse_file, extract_questions
from rag_engine import retrieve_relevant_chunks, answer_question
from exporter import export_to_docx

router = APIRouter()


# ── Background task ───────────────────────────────────────────────────────────

def _run_generation(session_id: int):
    """Runs the full RAG pipeline for every question in the session."""
    db = SessionLocal()
    try:
        session = db.query(QuestionnaireSession).filter(
            QuestionnaireSession.id == session_id
        ).first()
        if not session:
            return

        session.status = "processing"
        db.commit()

        ref_docs = (
            db.query(ReferenceDocument)
            .filter(ReferenceDocument.user_id == session.user_id)
            .all()
        )
        docs_data = [{"filename": d.filename, "content": d.content} for d in ref_docs]

        answers = (
            db.query(Answer)
            .filter(Answer.session_id == session_id)
            .order_by(Answer.index)
            .all()
        )

        for answer in answers:
            try:
                chunks = retrieve_relevant_chunks(answer.question, docs_data)
                result = answer_question(answer.question, chunks)
                answer.answer = result.get("answer", "Not found in references.")
                answer.citations = json.dumps(result.get("citations", []))
                answer.evidence_snippets = json.dumps(result.get("evidence_snippets", []))
                answer.confidence = result.get("confidence", 0.0)
                db.commit()
            except Exception as e:
                print(f"\n[ERROR] Failed on question {answer.index}: {answer.question}")
                print(traceback.format_exc())
                answer.answer = "Error generating answer."
                answer.citations = "[]"
                answer.evidence_snippets = "[]"
                answer.confidence = 0.0
                db.commit()

        session.status = "done"
        db.commit()

    except Exception:
        try:
            session = db.query(QuestionnaireSession).filter(
                QuestionnaireSession.id == session_id
            ).first()
            if session:
                session.status = "error"
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


# ── Pydantic models ───────────────────────────────────────────────────────────

class EditAnswerRequest(BaseModel):
    answer_text: str


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/upload")
async def upload_questionnaire(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    content_bytes = await file.read()
    try:
        text = parse_file(content_bytes, file.filename)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not parse file: {e}")

    questions = extract_questions(text)
    if not questions:
        raise HTTPException(status_code=400, detail="No questions found in the document.")

    session = QuestionnaireSession(
        user_id=current_user.id,
        filename=file.filename,
        status="pending",
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    return {"session_id": session.id, "questions": questions}


@router.post("/prepare/{session_id}")
def prepare_questions(
    session_id: int,
    questions: List[str],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = db.query(QuestionnaireSession).filter(
        QuestionnaireSession.id == session_id,
        QuestionnaireSession.user_id == current_user.id,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Clear any previous question stubs
    db.query(Answer).filter(Answer.session_id == session_id).delete()
    db.commit()

    for i, q in enumerate(questions):
        db.add(Answer(session_id=session_id, index=i, question=q))
    db.commit()

    return {"status": "prepared", "count": len(questions)}


@router.post("/generate/{session_id}")
def generate_answers(
    session_id: int,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = db.query(QuestionnaireSession).filter(
        QuestionnaireSession.id == session_id,
        QuestionnaireSession.user_id == current_user.id,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    background_tasks.add_task(_run_generation, session_id)
    return {"status": "started"}


@router.get("/sessions")
def list_sessions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    sessions = (
        db.query(QuestionnaireSession)
        .filter(QuestionnaireSession.user_id == current_user.id)
        .order_by(QuestionnaireSession.created_at.desc())
        .all()
    )
    return [
        {
            "id": s.id,
            "filename": s.filename,
            "status": s.status,
            "created_at": s.created_at.isoformat(),
        }
        for s in sessions
    ]


@router.get("/session/{session_id}")
def get_session(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = db.query(QuestionnaireSession).filter(
        QuestionnaireSession.id == session_id,
        QuestionnaireSession.user_id == current_user.id,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    answers = (
        db.query(Answer)
        .filter(Answer.session_id == session_id)
        .order_by(Answer.index)
        .all()
    )

    total = len(answers)
    answered = sum(
        1 for a in answers
        if a.answer and "not found" not in (a.answer or "").lower()
    )
    not_found = sum(
        1 for a in answers
        if a.answer and "not found" in (a.answer or "").lower()
    )

    return {
        "id": session.id,
        "filename": session.filename,
        "status": session.status,
        "created_at": session.created_at.isoformat(),
        "coverage": {"total": total, "answered": answered, "not_found": not_found},
        "answers": [
            {
                "id": a.id,
                "index": a.index,
                "question": a.question,
                "answer": a.answer,
                "citations": json.loads(a.citations or "[]"),
                "evidence_snippets": json.loads(a.evidence_snippets or "[]"),
                "confidence": a.confidence,
                "is_edited": a.is_edited,
            }
            for a in answers
        ],
    }


@router.patch("/answer/{answer_id}")
def edit_answer(
    answer_id: int,
    req: EditAnswerRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    answer = (
        db.query(Answer)
        .join(QuestionnaireSession)
        .filter(
            Answer.id == answer_id,
            QuestionnaireSession.user_id == current_user.id,
        )
        .first()
    )
    if not answer:
        raise HTTPException(status_code=404, detail="Answer not found")

    answer.answer = req.answer_text
    answer.is_edited = True
    db.commit()
    return {"status": "updated"}


@router.post("/regenerate/{answer_id}")
def regenerate_answer(
    answer_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    answer = (
        db.query(Answer)
        .join(QuestionnaireSession)
        .filter(
            Answer.id == answer_id,
            QuestionnaireSession.user_id == current_user.id,
        )
        .first()
    )
    if not answer:
        raise HTTPException(status_code=404, detail="Answer not found")

    ref_docs = (
        db.query(ReferenceDocument)
        .filter(ReferenceDocument.user_id == current_user.id)
        .all()
    )
    docs_data = [{"filename": d.filename, "content": d.content} for d in ref_docs]

    chunks = retrieve_relevant_chunks(answer.question, docs_data)
    result = answer_question(answer.question, chunks)

    answer.answer = result.get("answer", "Not found in references.")
    answer.citations = json.dumps(result.get("citations", []))
    answer.evidence_snippets = json.dumps(result.get("evidence_snippets", []))
    answer.confidence = result.get("confidence", 0.0)
    answer.is_edited = False
    db.commit()

    return {
        "id": answer.id,
        "answer": answer.answer,
        "citations": json.loads(answer.citations),
        "evidence_snippets": json.loads(answer.evidence_snippets),
        "confidence": answer.confidence,
        "is_edited": answer.is_edited,
    }


@router.get("/export/{session_id}")
def export_session(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = db.query(QuestionnaireSession).filter(
        QuestionnaireSession.id == session_id,
        QuestionnaireSession.user_id == current_user.id,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    answers = (
        db.query(Answer)
        .filter(Answer.session_id == session_id)
        .order_by(Answer.index)
        .all()
    )

    docx_bytes = export_to_docx(session.filename, answers)
    stem = session.filename.rsplit(".", 1)[0]
    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="answers_{stem}.docx"'},
    )
