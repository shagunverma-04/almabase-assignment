from sqlalchemy import create_engine, Column, Integer, String, Float, Boolean, Text, DateTime, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime

DATABASE_URL = "sqlite:///./questionnaire.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    documents = relationship("ReferenceDocument", back_populates="user", cascade="all, delete")
    sessions = relationship("QuestionnaireSession", back_populates="user", cascade="all, delete")


class ReferenceDocument(Base):
    __tablename__ = "reference_documents"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    filename = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="documents")


class QuestionnaireSession(Base):
    __tablename__ = "questionnaire_sessions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    filename = Column(String, nullable=False)
    status = Column(String, default="pending")  # pending, processing, done, error
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="sessions")
    answers = relationship(
        "Answer", back_populates="session",
        order_by="Answer.index", cascade="all, delete"
    )


class Answer(Base):
    __tablename__ = "answers"
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("questionnaire_sessions.id"), nullable=False)
    index = Column(Integer, nullable=False)
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=True)
    citations = Column(Text, nullable=True)         # JSON array stored as string
    evidence_snippets = Column(Text, nullable=True) # JSON array stored as string
    confidence = Column(Float, nullable=True)
    is_edited = Column(Boolean, default=False)

    session = relationship("QuestionnaireSession", back_populates="answers")
