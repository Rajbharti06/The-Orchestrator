---
name: backend-patterns
description: Battle-tested backend patterns for Express, FastAPI, Django, and Go Gin — auth, DB patterns, error handling, validation, middleware, and API design.
version: 1.0.0
triggers: [backend, express, fastapi, django, gin, api, rest, middleware, auth-backend]
tags: [backend, api, patterns, express, fastapi, django, go]
---

# Backend Patterns Skill

Production patterns for the 4 supported backend frameworks.

## Universal Patterns

### Health Endpoint (Required on Every App)
```python
# FastAPI
@app.get("/health")
async def health():
    return {"status": "ok", "uptime": time.time() - start_time, "version": VERSION}
```
```javascript
// Express
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), version: process.env.npm_package_version });
});
```

### Input Validation

Always validate at the boundary — never trust client input:

```python
# FastAPI with Pydantic
class CreateUserRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=100)
```
```javascript
// Express with Zod
const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(100),
});
```

### JWT Auth Pattern
```python
# FastAPI
async def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(401, "Invalid token")
        return await user_repo.get(user_id)
    except JWTError:
        raise HTTPException(401, "Token expired or invalid")
```

### Structured Error Responses
```javascript
// Express global error handler
app.use((err, req, res, next) => {
  const status = err.status || 500;
  res.status(status).json({
    error: { code: err.code || 'INTERNAL_ERROR', message: err.message },
    requestId: req.id,
  });
});
```

### Database Connection Pooling
```python
# FastAPI + SQLAlchemy
engine = create_async_engine(DATABASE_URL, pool_size=10, max_overflow=20)
```
```javascript
// Express + pg
const pool = new Pool({ connectionString: DATABASE_URL, max: 10, idleTimeoutMillis: 30_000 });
```

## Framework-Specific Patterns

### FastAPI
- Use `async def` for all route handlers
- Use `Depends()` for dependency injection
- Use Alembic for migrations
- Use `BackgroundTasks` for non-blocking work
- Router prefix pattern: `router = APIRouter(prefix="/api/v1")`

### Express
- Middleware order: cors → helmet → rateLimit → auth → routes → error
- Use `express-async-errors` for async error catching
- Always call `next(err)` in catch blocks
- Use `express-validator` or Zod for input validation

### Django
- Use `django-rest-framework` ViewSets for CRUD
- Use `django-environ` for environment variables
- Use `celery` for background tasks
- Use `django-cors-headers` for CORS

### Go Gin
- Use `gin.Recovery()` and `gin.Logger()` middleware
- Use `binding:"required"` tags for validation
- Use `sqlx` or `pgx` for PostgreSQL
- Use `golang-jwt/jwt` for JWT
