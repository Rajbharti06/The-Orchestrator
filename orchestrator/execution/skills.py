from __future__ import annotations

"""
Skill engine — Orchestrator X

Two-tier skill resolution:
  1. Fast index lookup:  skills_index.json (889 skills, zero file I/O per run)
  2. Lazy content load:  reads SKILL.md only for matched skills (top-N cap)

Skill catalog attribution:
  The antigravity-awesome-skills catalog used at runtime is sourced from
  github.com/benjaminasterA/antigravity-awesome-skills and is distributed
  under the MIT License (Copyright 2026 Antigravity User).
  This engine is an independent implementation; only the skill *content*
  (markdown knowledge files) originates from that project.

Falls back to the built-in mini-catalog if the external catalog is not found.
"""

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import NamedTuple

from ..config import MAX_SKILLS_PER_PROMPT, MAX_CHARS_PER_SKILL as _MAX_CHARS_PER_SKILL

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

_REPO_ROOT = Path(__file__).resolve().parents[3]   # …/REAL PROJECTS/Claude
_SKILLS_BASE = _REPO_ROOT / "antigravity-awesome-skills"
_INDEX_FILE  = _SKILLS_BASE / "skills_index.json"

# How many matched skills to inject per prompt (keep context sane)
_MAX_SKILLS = MAX_SKILLS_PER_PROMPT
# How many chars of each SKILL.md to include (already imported as _MAX_CHARS_PER_SKILL)


# ---------------------------------------------------------------------------
# Index entry
# ---------------------------------------------------------------------------

class SkillEntry(NamedTuple):
    id: str
    name: str
    description: str
    path: str          # relative to _SKILLS_BASE
    category: str


# ---------------------------------------------------------------------------
# Load index once
# ---------------------------------------------------------------------------

@lru_cache(maxsize=1)
def _load_index() -> list[SkillEntry]:
    if not _INDEX_FILE.exists():
        return []
    try:
        raw: list[dict] = json.loads(_INDEX_FILE.read_text(encoding="utf-8"))
        return [
            SkillEntry(
                id=s.get("id", ""),
                name=s.get("name", ""),
                description=s.get("description", ""),
                path=s.get("path", ""),
                category=s.get("category", ""),
            )
            for s in raw
            if s.get("name") and s.get("path")
        ]
    except Exception:
        return []


# ---------------------------------------------------------------------------
# Skill content loader (lazy, cached per skill id)
# ---------------------------------------------------------------------------

@lru_cache(maxsize=200)
def _load_skill_content(skill_path: str) -> str:
    """Return trimmed SKILL.md content for a given relative path."""
    base = _SKILLS_BASE / skill_path
    for fname in ("SKILL.md", "skill.md"):
        p = base / fname
        if p.exists():
            try:
                text = p.read_text(encoding="utf-8")
                # Strip YAML frontmatter
                if text.startswith("---"):
                    end = text.find("---", 3)
                    if end != -1:
                        text = text[end + 3:].lstrip()
                return text[:_MAX_CHARS_PER_SKILL]
            except Exception:
                pass
    return ""


# ---------------------------------------------------------------------------
# Scoring – keyword overlap between prompt tokens and skill name+description
# ---------------------------------------------------------------------------

_STOP_WORDS = frozenset(
    "a an the is are was were be been being have has had do does did "
    "will would could should may might shall can need to of in on at "
    "for with by from and or not but if when how what this that".split()
)

def _tokenize(text: str) -> set[str]:
    """
    Tokenize text for keyword matching.
    Splits on whitespace AND hyphens so 'fastapi-router-py' yields
    {'fastapi', 'router'} alongside the unsplit 'fastapi-router-py',
    giving both exact and sub-token matching.
    """
    # Replace hyphens/underscores with spaces so compound names split cleanly
    normalised = text.lower().replace("-", " ").replace("_", " ")
    tokens = re.findall(r"[a-z0-9]+", normalised)
    return {t for t in tokens if t not in _STOP_WORDS and len(t) > 2}


def _score(entry: SkillEntry, prompt_tokens: set[str]) -> int:
    """
    Score a skill against prompt tokens.

    Boost logic:
    - Base score = number of overlapping tokens
    - +2 bonus if the skill name starts with a prompt token (e.g. "fastapi"
      prefix on "fastapi-router-py" earns extra weight)
    """
    haystack = _tokenize(f"{entry.name} {entry.description} {entry.category}")
    base = len(prompt_tokens & haystack)
    # Name-prefix bonus: strongly weights skills whose domain matches the prompt
    name_tokens = _tokenize(entry.name)
    bonus = 2 if (prompt_tokens & name_tokens) else 0
    return base + bonus


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def select_skills(prompt: str, extra_tags: list[str] | None = None) -> str:
    """
    Return combined skill context strings relevant to the given prompt.
    Uses the external antigravity catalog when available; falls back to
    the built-in mini-catalog otherwise.
    """
    index = _load_index()
    if not index:
        return _builtin_select_skills(prompt, extra_tags)

    full_text = prompt + " " + " ".join(extra_tags or [])
    prompt_tokens = _tokenize(full_text)

    if not prompt_tokens:
        return ""

    # Score and rank
    scored = [(entry, _score(entry, prompt_tokens)) for entry in index]
    scored.sort(key=lambda x: -x[1])
    top = [(e, s) for e, s in scored if s > 0][:_MAX_SKILLS]

    if not top:
        return _builtin_select_skills(prompt, extra_tags)

    parts: list[str] = []
    for entry, score in top:
        content = _load_skill_content(entry.path)
        if content:
            parts.append(f"### Skill: {entry.name}\n{content}")
        else:
            # Fallback: use description from index
            parts.append(f"### Skill: {entry.name}\n{entry.description}")

    return "\n\n".join(parts)


def list_skill_names(prompt: str) -> list[str]:
    """Return names of skills that would be injected for this prompt (no content)."""
    index = _load_index()
    if not index:
        return []
    tokens = _tokenize(prompt)
    scored = [(e, _score(e, tokens)) for e in index]
    scored.sort(key=lambda x: -x[1])
    return [e.name for e, s in scored if s > 0][:_MAX_SKILLS]


def skill_count() -> int:
    """Return total number of skills in the loaded catalog."""
    index = _load_index()
    return len(index) if index else len(_BUILTIN_CATALOG)


# ---------------------------------------------------------------------------
# Built-in mini-catalog (fallback)
# ---------------------------------------------------------------------------

_BUILTIN_CATALOG: dict[str, dict] = {
    "@python-debug": {
        "tags": ["debug", "fix", "error", "traceback", "bug"],
        "context": (
            "Python debugging: read the FULL traceback bottom-to-top — the last frame is where "
            "the error occurred. Use ast.parse() to check syntax before running. "
            "Check NameError (typos), TypeError (wrong types), SyntaxError (line numbers)."
        ),
    },
    "@python-subprocess": {
        "tags": ["run", "execute", "command", "shell", "script"],
        "context": (
            "subprocess.run(cmd, capture_output=True, text=True, timeout=30). "
            "Check returncode == 0 for success. Read .stderr for full error output. "
            "Use shell=True only for simple string commands."
        ),
    },
    "@python-io": {
        "tags": ["file", "write", "read", "path", "save", "load"],
        "context": (
            "Use pathlib.Path for file operations. "
            "Path.parent.mkdir(parents=True, exist_ok=True) before writing. "
            "Always use encoding='utf-8' in read_text() / write_text()."
        ),
    },
    "@python-clean-code": {
        "tags": ["create", "build", "generate", "write", "script"],
        "context": (
            "Python scripts must have a main() function and if __name__ == '__main__': guard. "
            "Use type hints. Keep functions under 20 lines. "
            "No bare except clauses – catch specific exceptions."
        ),
    },
    "@python-self-healing": {
        "tags": ["retry", "fix", "repair", "heal", "loop"],
        "context": (
            "Self-healing pattern: capture the full stderr traceback, pass it to the LLM, "
            "apply a minimal replace_text patch first, rewrite_file only as a last resort. "
            "Track fix fingerprints to avoid repeating the same failed fix."
        ),
    },
    "@python-data": {
        "tags": ["data", "pandas", "csv", "json", "parse"],
        "context": (
            "Pandas: use pd.read_csv/json with explicit dtypes. Handle NaN with .fillna() or .dropna(). "
            "JSON: use json.loads/dumps with indent=2 for readability. "
            "Always validate data shape before processing."
        ),
    },
    "@python-api": {
        "tags": ["api", "request", "http", "endpoint", "fastapi", "flask"],
        "context": (
            "FastAPI: define Pydantic models for request/response. Use dependency injection. "
            "Add status_code to route decorators. Always include error handling with HTTPException. "
            "Use uvicorn.run() in an if __name__ == '__main__': guard."
        ),
    },
}


def _builtin_select_skills(prompt: str, extra_tags: list[str] | None = None) -> str:
    prompt_lower = prompt.lower()
    all_tags = list(extra_tags or [])
    contexts: list[str] = []
    seen: set[str] = set()

    for skill_name, skill in _BUILTIN_CATALOG.items():
        tags = skill["tags"]
        matched = any(t in prompt_lower for t in tags) or any(t in all_tags for t in tags)
        if matched and skill_name not in seen:
            contexts.append(skill["context"])
            seen.add(skill_name)

    return "\n".join(contexts)
