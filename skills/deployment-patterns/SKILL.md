---
name: deployment-patterns
description: Multi-platform deployment patterns — Railway, Vercel, Render, Fly.io with CI/CD, health checks, rollbacks
version: 1.0.0
triggers: [deploy, deployment, railway, vercel, render, fly, docker, ci, cd, production]
tags: [deployment, devops, production, docker]
---

# Deployment Patterns Skill

Orchestrator X deployment strategies for all supported platforms.

## Platform Selection Guide

| Stack | Recommended Platform | Why |
|-------|---------------------|-----|
| FastAPI + PostgreSQL | Railway | Native DB support, simple env vars |
| Express + MongoDB | Railway | Flexible, great for Node.js |
| Django + PostgreSQL | Render | Great Python support, free tier |
| Next.js | Vercel | Built for Next.js, edge CDN |
| Go + PostgreSQL | Fly.io | Low latency, good for Go |
| Any + Docker | Any | Portable, consistent |

## Required Files

Every deployed app needs:

### Dockerfile
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
HEALTHCHECK CMD curl -f http://localhost:3000/health || exit 1
CMD ["node", "index.js"]
```

### .env.example
```
PORT=3000
DATABASE_URL=postgresql://user:pass@localhost:5432/db
JWT_SECRET=your-jwt-secret-here
NODE_ENV=production
```

## Health Check Pattern

Every app must have a `/health` endpoint:
```python
@app.get("/health")
async def health():
    return {"status": "ok", "uptime": time.time() - start_time}
```

## Railway Deployment

```toml
# railway.toml
[build]
builder = "NIXPACKS"

[deploy]
startCommand = "uvicorn main:app --host 0.0.0.0 --port $PORT"
healthcheckPath = "/health"
healthcheckTimeout = 300
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
```

## Environment Variables

Never commit secrets. Use platform env var UI:
- Railway: Dashboard → Variables
- Vercel: Settings → Environment Variables
- Render: Environment → Secret Files
- Fly.io: `fly secrets set KEY=value`

## Rollback Strategy

Always deploy with:
- Zero-downtime deploys (health check before traffic switch)
- Previous version tag for quick rollback
- Database migrations with rollback scripts
