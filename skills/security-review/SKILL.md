---
name: security-review
description: OWASP Top 10 security scan for generated code — detects hardcoded secrets, SQL injection, XSS, CORS issues
version: 2.0.0
triggers: [security, scan, owasp, vulnerability, audit, secret, injection]
tags: [security, owasp, scanning]
---

# Security Review Skill

Orchestrator X includes built-in OWASP Top 10 security scanning via `securityScanner.js`.

## What Gets Scanned

| Category | Rule ID | Detection |
|----------|---------|-----------|
| Hardcoded Secrets | SEC-001 | `SECRET_KEY = "..."` |
| Hardcoded JWT Secret | SEC-002 | `jwt.encode(..., "secret")` |
| DB Credentials | SEC-003 | `postgresql://user:pass@host` |
| SQL Injection | SEC-010,011 | String concat in queries |
| Command Injection | SEC-012 | `exec(user_input + ...)` |
| Path Traversal | SEC-013 | `open(path + user_input)` |
| Missing Auth | SEC-020 | POST/PUT/DELETE without auth check |
| Weak Password Hash | SEC-021 | MD5/SHA1 for passwords |
| XSS | SEC-030,031 | `dangerouslySetInnerHTML`, `innerHTML=` |
| CORS Wildcard | SEC-040 | `allow_origins=["*"]` |
| JWT Algorithm None | SEC-050 | `algorithm="none"` |
| Missing JWT Expiry | SEC-051 | JWT without `exp` claim |
| eval() Usage | SEC-060 | `eval(user_input)` |
| Math.random for tokens | SEC-061 | `Math.random()` for secrets |
| Debug Mode | SEC-070 | `DEBUG=True` in production |
| Rate Limiting Missing | SEC-072 | Login endpoint without rate limit |

## Severity Levels

- **Critical**: Deploy blocker — hardcoded secrets, credential exposure
- **High**: Fix before production — injection, missing auth, XSS
- **Medium**: Should fix — CORS wildcard, JWT issues, eval
- **Low**: Best practice — debug mode, stack traces
- **Info**: Notes — security TODOs

## Usage

```bash
# Via API
POST /security-scan
{ "files": { "main.py": "...", "auth.js": "..." } }

# QA agent runs this automatically during every build
# Quality gate blocks deployment on critical/high findings
```

## Auto-Fix Suggestions

Every finding includes a specific fix:
```
SEC-001: Move SECRET_KEY to environment variables
  Fix: Use os.environ["SECRET_KEY"] or process.env.SECRET_KEY

SEC-010: Use parameterized queries
  Fix: cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
```

## Integration with Build Pipeline

The QA agent runs security scanning automatically:
- **Critical findings**: Build blocked, must fix
- **High findings (>1)**: Build blocked, must fix
- **Medium/Low**: Warning, build continues with note
- Score penalized: -25 per critical, -10 per high, -5 per medium
