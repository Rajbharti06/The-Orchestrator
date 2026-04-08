from __future__ import annotations

"""
WebSearchTool — Orchestrator X

Gives the agent real-time research capability using the DuckDuckGo
Instant Answer API (no API key required).

Payload format:
    {"query": "FastAPI rate limiting best practices", "max_results": 5}
    {"query": "Python subprocess timeout"}
"""

import json
from typing import Any
from urllib.parse import quote_plus
from urllib.request import urlopen, Request
from urllib.error import URLError

from ..tool_registry import ExecutionResult
from ...config import WEB_SEARCH_TIMEOUT

_DDG_URL = "https://api.duckduckgo.com/?q={query}&format=json&no_html=1&skip_disambig=1"
_TIMEOUT = WEB_SEARCH_TIMEOUT


class WebSearchTool:
    name: str = "WebSearchTool"
    description: str = (
        "Search the web for information using DuckDuckGo. "
        "payload: {query: str, max_results?: int (1-10)}"
    )

    def run(self, payload: Any) -> ExecutionResult:
        if isinstance(payload, str):
            payload = {"query": payload}

        if not isinstance(payload, dict):
            return self._fail("Payload must be a dict with 'query' key.")

        query = str(payload.get("query", "")).strip()
        if not query:
            return self._fail("'query' is required and must not be empty.")

        max_results = min(max(int(payload.get("max_results", 5)), 1), 10)

        try:
            url = _DDG_URL.format(query=quote_plus(query))
            req = Request(url, headers={"User-Agent": "OrchestratorX/1.0"})
            with urlopen(req, timeout=_TIMEOUT) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
            data = json.loads(raw)
        except URLError as exc:
            return self._fail(f"Network error: {exc}")
        except json.JSONDecodeError as exc:
            return self._fail(f"Invalid JSON response: {exc}")
        except Exception as exc:
            return self._fail(str(exc))

        lines: list[str] = []

        # Abstract (main answer)
        abstract = (data.get("AbstractText") or "").strip()
        abstract_src = (data.get("AbstractSource") or "").strip()
        if abstract:
            lines.append(f"Answer ({abstract_src}):\n{abstract}\n")

        # Related topics — DDG returns two shapes:
        #   Simple:  {"Text": "...", "FirstURL": "..."}
        #   Grouped: {"Name": "...", "Topics": [{...}, ...]}  ← wrapper, no Text
        topics = data.get("RelatedTopics", [])
        count = 0

        def _harvest(items: list, budget: int) -> list[str]:
            """Recursively extract text+url from simple and grouped topics."""
            results: list[str] = []
            for item in items:
                if len(results) // 2 >= budget:   # each item adds ≤2 lines
                    break
                if not isinstance(item, dict):
                    continue
                # Grouped topic: recurse into nested Topics list
                if item.get("Topics"):
                    results.extend(_harvest(item["Topics"], budget - len(results) // 2))
                    continue
                text = (item.get("Text") or "").strip()
                url_ref = (item.get("FirstURL") or "").strip()
                if text:
                    results.append(f"• {text}")
                    if url_ref:
                        results.append(f"  {url_ref}")
            return results

        lines.extend(_harvest(topics, max_results))

        # Infobox
        infobox = data.get("Infobox", {})
        if isinstance(infobox, dict):
            for entry in infobox.get("content", [])[:3]:
                label = entry.get("label", "")
                value = entry.get("value", "")
                if label and value:
                    lines.append(f"{label}: {value}")

        if not lines:
            return ExecutionResult(
                tool_name=self.name,
                success=True,
                output=f"No results found for: {query}",
            )

        output = f"Search: {query}\n" + "─" * 40 + "\n" + "\n".join(lines)
        return ExecutionResult(tool_name=self.name, success=True, output=output)

    def _fail(self, msg: str) -> ExecutionResult:
        return ExecutionResult(tool_name=self.name, success=False, output="", error=msg)
