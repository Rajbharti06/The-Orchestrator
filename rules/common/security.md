# Security Rules — Always Follow

These rules apply to EVERY file generated, regardless of stack or framework.

## Secrets & Credentials

- NEVER hardcode API keys, passwords, tokens, or connection strings in source files
- ALWAYS use environment variables: `process.env.SECRET`, `os.environ['SECRET']`
- ALWAYS document required env vars in `.env.example`
- NEVER commit `.env` files — always in `.gitignore`
- Use a secret manager (Vault, AWS Secrets Manager) for production

## Input Validation

- ALWAYS validate user input at every entry point (API, CLI, form)
- NEVER trust client-provided data — validate server-side regardless of client validation
- Use schema validation: Zod (JS), Pydantic (Python), validator (Go)
- Whitelist allowed values rather than blacklisting bad values

## SQL & Database

- NEVER concatenate user input into SQL strings
- ALWAYS use parameterized queries or ORM bindings
- NEVER expose raw database errors to clients
- Sanitize all NoSQL query operators ($where, $regex, etc.)

## Authentication

- NEVER store plaintext passwords — use bcrypt/argon2/scrypt with cost factor ≥12
- NEVER use MD5 or SHA1 for password hashing
- JWT secrets MUST be ≥256 bits random
- JWT tokens MUST expire (max 1 hour for access, 30 days for refresh)
- ALWAYS verify JWT algorithm is not "none"
- Rate-limit auth endpoints (max 5 attempts per minute)

## HTTP Security Headers

Always include:
```
Content-Security-Policy: default-src 'self'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

## API Security

- ALWAYS implement CORS with explicit origin allowlist (never `*` in production)
- Require auth on ALL non-public endpoints
- Return 401 for unauthenticated, 403 for unauthorized (not 404 to hide existence)
- Rate limit ALL endpoints (not just auth)

## Code Execution

- NEVER use `eval()`, `exec()`, `Function()` with user input
- NEVER use `shell=True` with user-controlled strings (Python subprocess)
- NEVER pass user input directly to `exec`, `spawn`, or `system` calls

## Logging

- NEVER log passwords, tokens, API keys, or PII
- Log security events: login attempts, permission denials, token refresh
- Use structured logging (JSON), never string concatenation with sensitive data

## Dependencies

- Run `npm audit` / `pip audit` / `go mod verify` before every production build
- Fix CRITICAL and HIGH CVEs before shipping
- Pin dependency versions in lock files
