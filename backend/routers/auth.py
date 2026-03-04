from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db, User
from auth_utils import hash_password, verify_password, create_token

router = APIRouter()


class AuthRequest(BaseModel):
    email: str
    password: str


@router.post("/register")
def register(req: AuthRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == req.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    user = User(email=req.email, hashed_password=hash_password(req.password))
    db.add(user)
    db.commit()
    token = create_token(user.email)
    return {"token": token, "email": user.email}


@router.post("/login")
def login(req: AuthRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_token(user.email)
    return {"token": token, "email": user.email}
