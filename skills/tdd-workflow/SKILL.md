---
name: tdd-workflow
description: Test-Driven Development workflow — Red → Green → Refactor with 80%+ coverage requirement
version: 1.0.0
triggers: [tdd, test, coverage, failing test, unit test, red green]
tags: [tdd, testing, quality]
---

# TDD Workflow Skill

Test-Driven Development for Orchestrator X generated code.

## The Cycle

```
RED:   Write a failing test that defines the behavior
GREEN: Write the MINIMUM code to make it pass
REFACTOR: Improve the code without breaking tests
```

## Coverage Requirements

- Minimum: **80% line coverage**
- Target: **90%+ for critical paths** (auth, payments, data access)
- Must test: all API endpoints, all auth flows, all error cases

## Stack-Specific Patterns

### Python / FastAPI
```python
# pytest + httpx for API testing
import pytest
from httpx import AsyncClient
from main import app

@pytest.mark.asyncio
async def test_login_success():
    async with AsyncClient(app=app, base_url="http://test") as client:
        resp = await client.post("/auth/login", json={"email": "test@test.com", "password": "pass"})
    assert resp.status_code == 200
    assert "token" in resp.json()
```

### JavaScript / Express
```javascript
// jest + supertest
import request from 'supertest';
import app from '../index.js';

describe('POST /auth/login', () => {
  it('returns token on valid credentials', async () => {
    const resp = await request(app).post('/auth/login').send({ email: 'test@test.com', password: 'pass' });
    expect(resp.status).toBe(200);
    expect(resp.body.token).toBeDefined();
  });
});
```

## Integration with QA Agent

The QA agent checks:
- Are test files present for all modules?
- Does test coverage meet the 80% threshold?
- Are auth flows and error cases covered?

## Running Tests

```bash
# Python
pytest --cov=. --cov-report=term-missing

# Node.js
npm test -- --coverage
```
