---
name: spec
description: Drop any spec — PRD markdown, OpenAPI YAML, GitHub issue URL, or one-line brief — and get a fully deployed product. Auto-detects format, normalizes to BuildSpec, and runs the full 8-phase pipeline.
triggers: [/spec]
---

# /spec — Spec-to-Product Command

Drop any spec format and get a deployed product.

## Usage

```bash
/spec ./requirements.md
/spec ./api.yaml
/spec "Build a Slack clone with channels, DMs, and file uploads"
/spec https://github.com/org/repo/issues/42
```

## What Happens

1. **spec-analyst** detects format (PRD / OpenAPI / GitHub issue / one-liner)
2. Normalizes to `BuildSpec` with title, endpoints, acceptance criteria, stack
3. Assesses complexity → assembles appropriate swarm
4. Runs full 8-phase pipeline: Strategy → Plan → Architect → Build → QA → Fix → Run → Test → Deploy
5. Returns deployed URL + build report

## Supported Formats

### PRD Markdown
```markdown
# App Name
## Goals
- Users can...
## Acceptance Criteria
- [ ] Feature 1
```

### OpenAPI YAML
```yaml
openapi: 3.0.0
info:
  title: My API
paths:
  /users:
    post:
      summary: Create user
```

### GitHub Issue
```
feat: Add OAuth2 login with GitHub and Google
Users should log in with GitHub or Google.
Acceptance: GitHub OAuth works, Google OAuth works
```

### One-Liner
```
Build a SaaS dashboard with JWT auth, Stripe billing, and real-time analytics
```

## Flags

| Flag | Description |
|------|-------------|
| `--dry-run` | Parse spec only, show BuildSpec without building |
| `--stack <name>` | Override suggested stack |
| `--complexity <low\|medium\|high>` | Override complexity assessment |
| `--no-deploy` | Build and test but skip deployment |
| `--swarm` | Enable full 8-swarm mode |

## Output

```
✓ Format detected: PRD markdown
✓ BuildSpec normalized (complexity: high, stack: fastapi+react+postgresql)
✓ Swarm assembled: engineering + operations + review (12 agents)
✓ Pipeline complete in 4m 32s
✓ Deployed: https://my-app.railway.app
✓ Report: reports/v0.14.0/
```
