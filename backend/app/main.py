from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.app.routes import auth

app = FastAPI(title="Orchestrator API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")

@app.get("/")
def health():
    return {"status": "ok", "service": "Orchestrator API"}
