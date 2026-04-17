from fastapi import APIRouter
router = APIRouter()
@router.post("/login")
def login(): return {"token": "mock"}
@router.post("/register")
def reg(): return {"msg": "ok"}
@router.post("/refresh")
def ref(): return {"msg": "ok"}
@router.post("/reset")
def res(): return {"msg": "ok"}
class users: pass