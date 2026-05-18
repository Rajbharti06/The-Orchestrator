---
name: security-scan
description: Run OWASP Top 10 security scan on generated or existing code
---

# /security-scan

Run the Orchestrator X security scanner on code files.

## Usage

```
/security-scan
/security-scan [path]
```

## What It Checks

- Hardcoded secrets (API keys, passwords, tokens)
- SQL injection vulnerabilities
- Command injection risks
- Path traversal vulnerabilities
- Missing authentication on sensitive routes
- Weak password hashing (MD5, SHA1)
- XSS vulnerabilities (dangerouslySetInnerHTML, innerHTML)
- CORS wildcard origins
- JWT issues (algorithm none, missing expiry)
- eval() usage
- Debug mode in production code
- Missing rate limiting on auth endpoints

## Output Format

```
## Security Scan Report
Status: FAILED
Findings: 3 total (1 critical, 1 high, 1 medium)

### CRITICAL (1)
- Hardcoded Secret Key in backend/config.py:12
  Snippet: SECRET_KEY = "my-hardcoded-secret-123"
  Fix: Use os.environ["SECRET_KEY"] instead

### HIGH (1)
- SQL Injection Risk in backend/users.py:45
  Fix: Use parameterized queries
```

## Integration

The security scanner runs automatically in every build's QA phase.
Critical + High findings block deployment.
All findings generate lessons for future builds.
