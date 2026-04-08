from __future__ import annotations

"""
Agent base class — Orchestrator X

Each agent has:
- A role name and description
- A specialized system prompt injected before every LLM call
- A set of preferred tools
- A confidence score for task routing
"""

from dataclasses import dataclass, field
from typing import Any


@dataclass
class AgentRole:
    name: str
    description: str
    system_prompt: str
    preferred_tools: list[str]
    keywords: list[str]          # used for task routing

    def matches(self, task_description: str) -> float:
        """Return a routing score 0–1 for how well this role fits a task."""
        desc_lower = task_description.lower()
        hits = sum(1 for kw in self.keywords if kw in desc_lower)
        return min(hits / max(len(self.keywords), 1), 1.0)
