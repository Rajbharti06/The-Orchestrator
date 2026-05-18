---
name: instinct-status
description: View all learned instincts with confidence scores
---

# /instinct-status

View the system's learned instincts — high-confidence patterns extracted from build history.

## Usage

```
/instinct-status
/instinct-status --min-confidence 0.7
```

## What Instincts Are

Instincts are lightweight patterns with Bayesian confidence scores (0-1):
- **0.0-0.2**: Very low confidence, will be pruned
- **0.2-0.5**: Building evidence, not yet injected into prompts
- **0.5-0.7**: Moderate confidence, injected selectively
- **0.7-0.85**: High confidence, injected in most contexts
- **0.85-1.0**: Expert confidence, graduates to skill

## Output

```
## Active Instincts (15 total)

[95%] Always include CORSMiddleware in FastAPI apps with frontend
      Context: fastapi, api
      Uses: 23, Successes: 22, Failures: 1

[88%] Use bcrypt for password hashing, never MD5 or SHA1
      Context: authentication, security
      Uses: 18, Successes: 16, Failures: 2

[76%] React useState + useEffect pattern for API data fetching
      Context: react, frontend
      Uses: 12, Successes: 9, Failures: 3
```

## Management

```
# Prune low-confidence instincts (< 0.2 and > 30 days old)
POST /instincts/prune

# Evolve high-confidence instincts into formal skills
POST /instincts/evolve

# Export all instincts (for sharing/backup)
GET /instincts
```
