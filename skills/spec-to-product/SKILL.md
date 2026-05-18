---
name: spec-to-product
description: Drop any spec — PRD, GitHub issue, OpenAPI YAML, or one-line brief — and get a fully deployed product. Auto-detects format, parses into a BuildSpec, and feeds the full pipeline.
version: 1.0.0
triggers: [spec, prd, openapi, github-issue, spec-to-product, drop-spec, brief]
tags: [spec, prd, openapi, autonomous, input-format]
---

# Spec-to-Product Skill

Any input format → deployed product. The orchestrator handles the translation.

## Supported Input Formats

### 1. PRD (Product Requirements Document)
```markdown
# Task Manager App

## Goals
- Teams can create, assign, and track tasks
- Real-time notifications via WebSocket
- Mobile-first responsive UI

## User Stories
- As a user, I can create a task with title, description, and due date
- As a manager, I can assign tasks to team members

## Acceptance Criteria
- [ ] Task CRUD with PostgreSQL
- [ ] JWT authentication
- [ ] WebSocket notifications
- [ ] 95% uptime SLA
```

### 2. OpenAPI Specification
```yaml
openapi: 3.0.0
info:
  title: Task Manager API
paths:
  /tasks:
    post:
      summary: Create task
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/TaskCreate'
```

### 3. GitHub Issue
```
feat: Add OAuth2 login with GitHub and Google

Users should be able to log in with their GitHub or Google accounts
instead of creating new credentials.

Acceptance: 
- GitHub OAuth works
- Google OAuth works  
- Existing email users can link OAuth
```

### 4. One-liner
```
Build a SaaS dashboard with JWT auth, Stripe billing, and real-time analytics
```

## Auto-Detection

```javascript
import { parseSpec, specToPrompt } from './lib/specParser.js';

const spec = await parseSpec(input);
// { type: 'prd'|'openapi'|'github-issue'|'brief', title, endpoints?, schema?, acceptanceCriteria }

const prompt = await specToPrompt(spec);
// Optimized orchestrator prompt with all context
```

## Normalized BuildSpec

All formats normalize to the same shape:
```javascript
{
  type: 'prd',
  title: 'Task Manager App',
  description: 'Teams can create, assign, and track tasks...',
  acceptanceCriteria: ['Task CRUD with PostgreSQL', 'JWT auth', ...],
  endpoints: [{ method: 'POST', path: '/tasks', schema: {...} }],
  estimatedComplexity: 'high',
  suggestedStack: { backend: 'fastapi', frontend: 'react', db: 'postgresql' }
}
```

## Usage via CLI

```bash
# Drop a spec file
orchestrator spec ./requirements.md
orchestrator spec ./api.yaml
orchestrator spec "Build a Slack clone with channels and DMs"

# Via API
curl -X POST http://localhost:3000/spec \
  -F "file=@./prd.md"
```

## Accuracy

Parsing accuracy by format:
- PRD markdown: High (structured headings)
- OpenAPI: Very high (machine-readable)
- GitHub issue: Medium (semi-structured)
- One-liner: Uses LLM for intent extraction
