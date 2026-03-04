from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from database import get_db, User, ReferenceDocument
from auth_utils import get_current_user
from file_parser import parse_file

router = APIRouter()


@router.get("/reference")
def list_reference_docs(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    docs = (
        db.query(ReferenceDocument)
        .filter(ReferenceDocument.user_id == current_user.id)
        .order_by(ReferenceDocument.created_at.desc())
        .all()
    )
    return [
        {"id": d.id, "filename": d.filename, "preview": d.content[:200]}
        for d in docs
    ]


@router.post("/reference")
async def upload_reference_doc(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    content_bytes = await file.read()
    try:
        text = parse_file(content_bytes, file.filename)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not parse file: {e}")

    if not text.strip():
        raise HTTPException(status_code=400, detail="File appears to be empty or unreadable")

    doc = ReferenceDocument(
        user_id=current_user.id,
        filename=file.filename,
        content=text,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return {"id": doc.id, "filename": doc.filename}


@router.delete("/reference/{doc_id}")
def delete_reference_doc(
    doc_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    doc = (
        db.query(ReferenceDocument)
        .filter(
            ReferenceDocument.id == doc_id,
            ReferenceDocument.user_id == current_user.id,
        )
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    db.delete(doc)
    db.commit()
    return {"status": "deleted"}
