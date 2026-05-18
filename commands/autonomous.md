---
description: Toggle the autonomous self-improvement loop — runs eval suite every 10 minutes, extracts lessons from failures, and evolves instincts into skills without human intervention.
---

# /autonomous — Toggle Autonomous Mode

Start or stop the autonomous self-improvement loop.

**What the loop does (every 10 minutes):**
1. Runs 8-case eval suite against real LLM calls
2. Scores each case (0–100)
3. Extracts lessons from failures → `memory/lessons.json`
4. Updates instinct confidence scores
5. Prunes expired/low-confidence instincts
6. Graduates top instincts to skills when confidence ≥0.85
7. Reports trend: improving / declining / stable

**Usage:**
```
/autonomous start
/autonomous stop
/autonomous status
/autonomous run-cycle  (manual single run)
```

**Requirements:**
- API keys configured in `.env`
- Server running (`npm start`)

**Via API:**
- `POST /autonomous/start`
- `POST /autonomous/stop`
- `GET /autonomous/status`
- `POST /autonomous/run-cycle`

**Dashboard:** The autonomous loop status and score history are visible in the dashboard at `http://localhost:3000`.
