# Python Rules — Always Follow

## Code Style

- Follow PEP 8 — use `ruff` for linting and `black` for formatting
- Line length: 88 characters (black default)
- Use f-strings, not `.format()` or `%` formatting
- Use `pathlib.Path` not `os.path` for file paths

## Type Hints

```python
# Always type-hint function signatures
async def create_user(email: str, password: str) -> User:
    ...

# Use TypedDict for dict shapes
from typing import TypedDict
class UserCreate(TypedDict):
    email: str
    password: str
```

## Async

```python
# Use async/await consistently — never mix with sync DB calls
async def get_user(user_id: int) -> User | None:
    async with db.begin():
        return await db.get(User, user_id)

# Use asyncio.gather for parallel async operations
results = await asyncio.gather(fetch_user(id), fetch_posts(id))
```

## Error Handling

```python
# Specific exceptions, not bare except
try:
    result = await api.get(url)
except httpx.TimeoutException:
    raise ServiceUnavailableError(f"Timeout fetching {url}")
except httpx.HTTPStatusError as e:
    raise ExternalApiError(f"API returned {e.response.status_code}")
# Never: except Exception: pass
```

## FastAPI Patterns

```python
# Use Pydantic v2 models
from pydantic import BaseModel, EmailStr, Field

class CreateUserRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

# Use dependency injection
async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> User:
    ...

# Always use lifespan for startup/shutdown
@asynccontextmanager
async def lifespan(app: FastAPI):
    await startup()
    yield
    await shutdown()
```

## File Organization

```
src/
├── main.py          # App factory + lifespan
├── config.py        # Settings via pydantic-settings
├── models/          # SQLAlchemy models
├── schemas/         # Pydantic schemas
├── routers/         # FastAPI routers
├── services/        # Business logic
├── repositories/    # DB access layer
└── tests/
```

## Dependencies

- Always use `pyproject.toml` not `requirements.txt`
- Pin versions in `poetry.lock` or `uv.lock`
- Use `pydantic-settings` for environment configuration
- Use `httpx` not `requests` for async HTTP
