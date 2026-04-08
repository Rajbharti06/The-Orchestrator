from __future__ import annotations

"""
Orchestrator X — central configuration.

All tunable parameters live here. Override any value with an environment
variable of the same name (upper-cased), e.g.:

    ORCHESTRATOR_MAX_RETRIES=5 python -m src.orchestrator "..."
"""

import os
from pathlib import Path


def _int(key: str, default: int) -> int:
    return int(os.getenv(key, default))


def _str(key: str, default: str) -> str:
    return os.getenv(key, default)


def _path(key: str, default: Path) -> Path:
    val = os.getenv(key)
    return Path(val) if val else default


# ---------------------------------------------------------------------------
# Data / persistence
# ---------------------------------------------------------------------------

#: Directory where session and history JSON files are stored.
DATA_DIR: Path = _path(
    "ORCHESTRATOR_DATA_DIR",
    Path.home() / ".orchestrator_x",
)

SESSION_FILE: str     = "session.json"
HISTORY_FILE: str     = "history.json"
MAX_HISTORY_SESSIONS: int = _int("ORCHESTRATOR_MAX_HISTORY_SESSIONS", 30)

# ---------------------------------------------------------------------------
# Agent loop
# ---------------------------------------------------------------------------

MAX_RETRIES: int = _int("ORCHESTRATOR_MAX_RETRIES", 3)
SWARM_MAX_WORKERS: int = _int("ORCHESTRATOR_SWARM_MAX_WORKERS", 4)

# ---------------------------------------------------------------------------
# Skills
# ---------------------------------------------------------------------------

MAX_SKILLS_PER_PROMPT: int = _int("ORCHESTRATOR_MAX_SKILLS", 5)
MAX_CHARS_PER_SKILL:   int = _int("ORCHESTRATOR_MAX_CHARS_PER_SKILL", 1200)

# ---------------------------------------------------------------------------
# Tools — timeouts (seconds)
# ---------------------------------------------------------------------------

SYSTEM_OPERATOR_TIMEOUT: int = _int("ORCHESTRATOR_SYSTEM_TIMEOUT", 30)
DEPLOY_AGENT_TIMEOUT:    int = _int("ORCHESTRATOR_DEPLOY_TIMEOUT", 8)
GIT_TOOL_TIMEOUT:        int = _int("ORCHESTRATOR_GIT_TIMEOUT", 15)
WEB_SEARCH_TIMEOUT:      int = _int("ORCHESTRATOR_WEB_SEARCH_TIMEOUT", 8)
AUTO_INSTALLER_TIMEOUT:  int = _int("ORCHESTRATOR_INSTALLER_TIMEOUT", 90)
ENV_PROBE_TIMEOUT:       int = _int("ORCHESTRATOR_ENV_PROBE_TIMEOUT", 20)

# ---------------------------------------------------------------------------
# Approval
# ---------------------------------------------------------------------------

APPROVAL_MODE: str = _str("ORCHESTRATOR_APPROVAL", "suggest")
# auto     – execute everything, never ask
# suggest  – ask before shell commands, deploys, and git commits (default)
# manual   – ask before every single action

# ---------------------------------------------------------------------------
# LLM
# ---------------------------------------------------------------------------

DEFAULT_PROVIDER: str  = _str("ORCHESTRATOR_PROVIDER", "mock")
LLM_MAX_TOKENS:   int  = _int("ORCHESTRATOR_LLM_MAX_TOKENS", 2048)
LLM_TEMPERATURE: float = float(os.getenv("ORCHESTRATOR_LLM_TEMPERATURE", "0.3"))
