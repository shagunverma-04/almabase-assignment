from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
from routers import auth, documents, questionnaire

Base.metadata.create_all(bind=engine)

app = FastAPI(title="QuestionnaireAI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(documents.router, prefix="/documents", tags=["documents"])
app.include_router(questionnaire.router, prefix="/questionnaire", tags=["questionnaire"])

@app.get("/health")
def health():
    return {"status": "ok"}
