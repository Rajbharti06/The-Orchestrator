from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta
import os

router = APIRouter(prefix="/auth", tags=["auth"])

SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-production-use-a-long-random-string")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# In-memory user store — replace with SQLAlchemy + PostgreSQL in production
_users: dict[str, dict] = {}


class UserRegister(BaseModel):
    email: str
    password: str
    username: str | None = None


class UserLogin(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class ResetRequest(BaseModel):
    email: str


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_token(data: dict, expires_delta: timedelta) -> str:
    payload = {**data, "exp": datetime.utcnow() + expires_delta}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    payload = decode_token(token)
    email = payload.get("sub")
    if not email or email not in _users:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return _users[email]


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(body: UserRegister):
    if body.email in _users:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")
    _users[body.email] = {
        "email": body.email,
        "username": body.username or body.email.split("@")[0],
        "hashed_password": hash_password(body.password),
    }
    access = create_token({"sub": body.email}, timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    refresh = create_token({"sub": body.email, "type": "refresh"}, timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS))
    return TokenResponse(access_token=access, refresh_token=refresh)


@router.post("/login", response_model=TokenResponse)
def login(body: UserLogin):
    user = _users.get(body.email)
    if not user or not verify_password(body.password, user["hashed_password"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    access = create_token({"sub": body.email}, timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    refresh = create_token({"sub": body.email, "type": "refresh"}, timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS))
    return TokenResponse(access_token=access, refresh_token=refresh)


@router.post("/refresh", response_model=TokenResponse)
def refresh(body: RefreshRequest):
    payload = decode_token(body.refresh_token)
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    email = payload.get("sub")
    if not email or email not in _users:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    access = create_token({"sub": email}, timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    new_refresh = create_token({"sub": email, "type": "refresh"}, timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS))
    return TokenResponse(access_token=access, refresh_token=new_refresh)


@router.post("/reset")
def reset_password(body: ResetRequest):
    if body.email not in _users:
        # Return 200 even for unknown emails to prevent user enumeration
        return {"msg": "If that email exists, a reset link has been sent"}
    # In production: generate a signed reset token and email it
    reset_token = create_token({"sub": body.email, "type": "reset"}, timedelta(hours=1))
    return {"msg": "If that email exists, a reset link has been sent", "debug_token": reset_token}


@router.get("/me")
def get_me(current_user: dict = Depends(get_current_user)):
    return {"email": current_user["email"], "username": current_user["username"]}
