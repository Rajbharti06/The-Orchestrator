from __future__ import annotations

"""
MemoryEngine — Orchestrator X

Single-session:  records all actions, files, failures.
Cross-session:   rolls up the last N sessions in ~/.orchestrator_x/history.json.
                 Surfaces recurring failure patterns as "critical" to the planner.
Persistent intel: tracks what FIX strategies actually worked, so the brain
                  learns your preferred patterns over time.
"""

import json
from datetime import datetime
from pathlib import Path

from ..config import DATA_DIR, HISTORY_FILE, MAX_HISTORY_SESSIONS, SESSION_FILE

# Ensure data directory exists
DATA_DIR.mkdir(parents=True, exist_ok=True)

_HISTORY_FILE = DATA_DIR / HISTORY_FILE
_MAX_HISTORY_SESSIONS = MAX_HISTORY_SESSIONS


class MemoryEngine:

    def __init__(self, session_id: str):
        self.session_id = session_id
        self.data: dict = {
            "session_id": session_id,
            "start_time": datetime.now().isoformat(),
            "files_created": [],
            "actions_taken": [],
            "failures": [],
            "successes": [],          # new: successful task records
            "fix_patterns": [],       # new: what fixes actually worked
            "deployed_apps": [],      # new: apps launched this session
            "context": {},
        }
        self._history: list[dict] = self._load_history()

    # ================================================================ record

    def record_file(self, path: str) -> None:
        if path not in self.data["files_created"]:
            self.data["files_created"].append(path)

    def record_action(
        self,
        tool: str,
        payload: str,
        success: bool,
        error: str | None = None,
    ) -> None:
        entry = {
            "timestamp": datetime.now().isoformat(),
            "tool": tool,
            "payload": payload,
            "success": success,
            "error": error,
        }
        self.data["actions_taken"].append(entry)
        if not success:
            self.data["failures"].append(entry)
        else:
            self.data["successes"].append(entry)

    def record_fix_pattern(
        self,
        error_type: str,
        fix_mode: str,
        fix_summary: str,
        worked: bool,
    ) -> None:
        """
        After a fix attempt, record whether it worked.
        Also update the running confidence score (successes / attempts)
        so the brain learns which strategies are most reliable.
        """
        # Update existing cross-session pattern if one matches
        key = f"{error_type}::{fix_mode}"
        matched = None
        for fp in self.data["fix_patterns"]:
            if f"{fp.get('error_type')}::{fp.get('fix_mode')}" == key:
                matched = fp
                break

        if matched:
            matched["attempts"] = matched.get("attempts", 1) + 1
            if worked:
                matched["successes"] = matched.get("successes", 0) + 1
            matched["confidence"] = round(
                matched.get("successes", 0) / matched["attempts"], 3
            )
            matched["worked"] = worked  # latest outcome
            matched["timestamp"] = datetime.now().isoformat()
        else:
            self.data["fix_patterns"].append({
                "timestamp": datetime.now().isoformat(),
                "error_type": error_type,
                "fix_mode": fix_mode,
                "fix_summary": fix_summary,
                "worked": worked,
                "attempts": 1,
                "successes": 1 if worked else 0,
                "confidence": 1.0 if worked else 0.0,
            })

    def record_deployed_app(self, url: str, app_type: str, pid: int) -> None:
        self.data["deployed_apps"].append({
            "timestamp": datetime.now().isoformat(),
            "url": url,
            "app_type": app_type,
            "pid": pid,
        })

    def record_run_learning(self, learning: dict) -> None:
        """Store a pattern learned from a successful run."""
        if "run_learnings" not in self.data:
            self.data["run_learnings"] = []
        self.data["run_learnings"].append({
            "timestamp": datetime.now().isoformat(),
            **learning,
        })

    def get_run_learnings(self) -> list[dict]:
        """Return successful patterns from past sessions."""
        learnings: list[dict] = []
        for session in self._history:
            learnings.extend(session.get("run_learnings", []))
        return learnings[-10:]  # last 10 patterns

    def update_context(self, key: str, value: object) -> None:
        self.data["context"][key] = value

    def get_context(self) -> dict:
        return self.data["context"]

    # ======================================================= cross-session intel

    def get_critical_failures(self) -> list[dict]:
        """
        Failures that recurred in 2+ past sessions.
        Fed to the planner so it avoids known pitfalls.
        """
        counts: dict[str, int] = {}
        sample: dict[str, dict] = {}
        for session in self._history:
            for f in session.get("failures", []):
                key = f"{f.get('tool')}::{str(f.get('error', ''))[:80]}"
                counts[key] = counts.get(key, 0) + 1
                sample[key] = f
        return [sample[k] for k, v in counts.items() if v >= 2]

    def get_winning_fix_patterns(self) -> list[dict]:
        """
        Fix strategies that succeeded in previous sessions.
        Surface to the Fix Agent so it picks the best approach first.
        """
        winning: list[dict] = []
        for session in self._history:
            for fp in session.get("fix_patterns", []):
                if fp.get("worked"):
                    winning.append(fp)
        # Deduplicate by error_type+fix_mode; prefer highest confidence
        seen: set[str] = set()
        deduped: list[dict] = []
        for fp in reversed(winning):
            key = f"{fp.get('error_type')}::{fp.get('fix_mode')}"
            if key not in seen:
                seen.add(key)
                deduped.append(fp)
        # Sort by confidence score (descending); fall back to timestamp
        deduped.sort(key=lambda x: (-x.get("confidence", 1.0), x.get("timestamp", "")))
        return deduped[:10]  # top-10 highest-confidence winners

    def search_similar_fix(self, error_text: str, max_results: int = 3) -> list[dict]:
        """
        Find historical fix patterns whose error_type or fix_summary overlaps
        with the given error text.  Returns best matches sorted by confidence.

        Used by the Fix Agent to avoid re-inventing proven solutions.
        """
        error_lower = error_text.lower()
        error_words = set(w for w in error_lower.split() if len(w) > 3)

        candidates: list[tuple[float, dict]] = []

        # Search current session + cross-session history
        all_patterns: list[dict] = list(self.data.get("fix_patterns", []))
        for session in self._history:
            all_patterns.extend(session.get("fix_patterns", []))

        for fp in all_patterns:
            if not fp.get("worked"):
                continue
            confidence = fp.get("confidence", 0.5)
            if confidence < 0.3:
                continue

            haystack = (
                fp.get("error_type", "") + " " + fp.get("fix_summary", "")
            ).lower()
            overlap = sum(1 for w in error_words if w in haystack)
            if overlap > 0:
                # Weight by overlap + stored confidence
                score = overlap * confidence
                candidates.append((score, fp))

        candidates.sort(key=lambda x: -x[0])
        seen: set[str] = set()
        results: list[dict] = []
        for _, fp in candidates:
            key = f"{fp.get('error_type')}::{fp.get('fix_mode')}"
            if key not in seen:
                seen.add(key)
                results.append(fp)
            if len(results) >= max_results:
                break
        return results

    def get_deployed_apps(self) -> list[dict]:
        """All apps deployed across recent sessions."""
        apps: list[dict] = []
        for session in self._history:
            apps.extend(session.get("deployed_apps", []))
        return apps[-5:]

    # ============================================================= persistence

    def save(self, path: str | None = None) -> None:
        dest = Path(path) if path else DATA_DIR / SESSION_FILE
        dest.parent.mkdir(parents=True, exist_ok=True)
        with open(dest, "w", encoding="utf-8") as f:
            json.dump(self.data, f, indent=4)
        print(f"[Memory] Session saved -> {dest}")
        self._append_to_history()

    # --------------------------------------------------------------- history

    def _load_history(self) -> list[dict]:
        if not _HISTORY_FILE.exists():
            return []
        try:
            raw = _HISTORY_FILE.read_text(encoding="utf-8")
            data = json.loads(raw)
            return data if isinstance(data, list) else []
        except Exception:
            return []

    def _append_to_history(self) -> None:
        summary = {
            "session_id": self.session_id,
            "start_time": self.data["start_time"],
            "end_time": datetime.now().isoformat(),
            "files_created": self.data["files_created"],
            "failures": self.data["failures"],
            "fix_patterns": self.data["fix_patterns"],
            "deployed_apps": self.data["deployed_apps"],
            "run_learnings": self.data.get("run_learnings", []),
            "total_actions": len(self.data["actions_taken"]),
        }
        history = self._load_history()
        history.append(summary)
        if len(history) > _MAX_HISTORY_SESSIONS:
            history = history[-_MAX_HISTORY_SESSIONS:]
        try:
            _HISTORY_FILE.write_text(
                json.dumps(history, indent=2), encoding="utf-8"
            )
        except Exception:
            pass
