from __future__ import annotations

import json
import time
from typing import Dict, Any


# ---------------------------------------------------------------------------
# Provider base class
# ---------------------------------------------------------------------------

class LLMProvider:
    def generate(self, system_prompt: str, user_prompt: str) -> str:
        raise NotImplementedError


# ---------------------------------------------------------------------------
# Real providers
# ---------------------------------------------------------------------------

class ClaudeProvider(LLMProvider):
    """Anthropic Claude - best reasoning and code generation."""

    def __init__(self, model: str = "claude-sonnet-4-6"):
        import anthropic
        self.client = anthropic.Anthropic()
        self.model = model

    def generate(self, system_prompt: str, user_prompt: str) -> str:
        message = self.client.messages.create(
            model=self.model,
            max_tokens=2048,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )
        return message.content[0].text


class GroqProvider(LLMProvider):
    """Groq - fast inference for open-source models."""

    def __init__(self, model: str = "llama-3.3-70b-versatile"):
        from groq import Groq
        self.client = Groq()
        self.model = model

    def generate(self, system_prompt: str, user_prompt: str) -> str:
        completion = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=2048,
            temperature=0.3,
        )
        return completion.choices[0].message.content


class OllamaProvider(LLMProvider):
    """Local Ollama - offline / private operation."""

    def __init__(self, model: str = "llama3", base_url: str = "http://localhost:11434"):
        self.model = model
        self.base_url = base_url

    def generate(self, system_prompt: str, user_prompt: str) -> str:
        import httpx
        response = httpx.post(
            f"{self.base_url}/api/generate",
            json={
                "model": self.model,
                "prompt": f"System: {system_prompt}\nUser: {user_prompt}",
                "stream": False,
            },
            timeout=60.0,
        )
        return response.json().get("response", "")


class KimiProvider(LLMProvider):
    """Kimi K2.5 via Ollama cloud - frontier model, proper chat API."""

    def __init__(self, model: str = "kimi-k2.5:cloud", base_url: str = "http://localhost:11434"):
        self.model = model
        self.base_url = base_url

    def generate(self, system_prompt: str, user_prompt: str) -> str:
        import httpx
        for attempt in range(2):  # 1 retry on timeout
            try:
                response = httpx.post(
                    f"{self.base_url}/api/chat",
                    json={
                        "model": self.model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt},
                        ],
                        "stream": False,
                    },
                    timeout=300.0,
                )
                return response.json().get("message", {}).get("content", "")
            except httpx.ReadTimeout:
                if attempt == 0:
                    print("[Kimi] Response timeout - retrying ...")
                    continue
                raise


# ---------------------------------------------------------------------------
# Fallback chain - tries providers in order with exponential backoff
# ---------------------------------------------------------------------------

class FallbackChainProvider(LLMProvider):
    """Tries providers in priority order, backs off and falls through on failure."""

    def __init__(self, providers: list[LLMProvider]):
        self.providers = providers

    def generate(self, system_prompt: str, user_prompt: str) -> str:
        last_error: Exception | None = None
        for i, provider in enumerate(self.providers):
            try:
                return provider.generate(system_prompt, user_prompt)
            except Exception as e:
                last_error = e
                if i < len(self.providers) - 1:
                    wait = 2 ** i  # 1 s, 2 s, 4 s ...
                    print(f"[LLMBrain] Provider {type(provider).__name__} failed ({e}). Retrying in {wait}s ...")
                    time.sleep(wait)
        raise RuntimeError(f"All providers failed. Last error: {last_error}")


# ---------------------------------------------------------------------------
# Mock provider - deterministic, no API key needed
# ---------------------------------------------------------------------------

class MockProvider(LLMProvider):
    """Deterministic mock for testing without API keys."""

    def generate(self, system_prompt: str, user_prompt: str) -> str:
        sp = system_prompt.lower()
        up = user_prompt.lower()

        # ---- PLANNER ---------------------------------------------------
        if "plan" in sp or "planner" in sp:
            if "fib" in up:
                fname = "fib.py"
                for word in up.split():
                    if word.endswith(".py"):
                        fname = word
                        break
                return json.dumps([
                    {"id": "write-fib", "description": f"Create {fname}", "tool": "FileEngine",
                     "payload": {"action": "write", "path": fname,
                                 "content": "def fib(n):\n    return n if n <= 1 else fib(n-1) + fib(n-2)\nif __name__ == '__main__':\n    print(fib(10))"}},
                    {"id": "run-fib", "description": f"Run {fname}", "tool": "SystemOperator",
                     "payload": {"command": f"python {fname}"}, "depends_on": ["write-fib"]},
                ])
            if "git" in up or "status" in up:
                return json.dumps([
                    {"id": "git-status", "description": "Check git status", "tool": "GitTool",
                     "payload": {"action": "status"}},
                ])
            if "search" in up or "research" in up:
                query = up.replace("search for", "").replace("research", "").strip()[:60]
                return json.dumps([
                    {"id": "web-search", "description": f"Search: {query}", "tool": "WebSearchTool",
                     "payload": {"query": query or "Python best practices"}},
                ])
            # Default: hello world with proper depends_on
            fname = "hello.py"
            for word in up.split():
                if word.endswith(".py"):
                    fname = word
                    break
            return json.dumps([
                {"id": "write-file", "description": f"Create {fname}", "tool": "FileEngine",
                 "payload": {"action": "write", "path": fname,
                             "content": f"if __name__ == '__main__':\n    print('hello world')"}},
                {"id": "run-file", "description": f"Run {fname}", "tool": "SystemOperator",
                 "payload": {"command": f"python {fname}"}, "depends_on": ["write-file"]},
            ])

        # ---- FIX AGENT -------------------------------------------------
        if "fix agent" in sp or "debugger" in sp or "senior python" in sp:
            try:
                ctx = json.loads(user_prompt)
            except Exception:
                ctx = {}
            target = ctx.get("target_file") or "buggy.py"
            code = ctx.get("file_content", "")
            err = str(ctx.get("error_excerpt", ""))

            if "pritn" in code or "nameerror" in err.lower():
                return json.dumps({"mode": "replace_text", "target_file": target,
                                   "old_text": "pritn", "new_text": "print",
                                   "summary": "NameError: typo 'pritn' -> 'print'."})
            if "zerodivisionerror" in err.lower() or "division by zero" in err.lower():
                return json.dumps({"mode": "replace_text", "target_file": target,
                                   "old_text": "/ 0", "new_text": "/ 1",
                                   "summary": "ZeroDivisionError: changed denominator 0 -> 1."})
            return json.dumps({"mode": "rewrite_file", "target_file": target,
                               "new_content": code,
                               "summary": "No deterministic fix found in mock mode."})

        # ---- REFLECT ---------------------------------------------------
        if "reflect" in sp:
            return json.dumps({
                "root_cause": "Mock mode cannot diagnose root causes.",
                "different_approach": "Try rewriting the file with corrected logic.",
            })

        return "Mock provider has no response for this prompt type."


# ---------------------------------------------------------------------------
# Provider factory
# ---------------------------------------------------------------------------

def _build_provider(provider_type: str) -> LLMProvider:
    if provider_type == "mock":
        return MockProvider()

    if provider_type == "kimi":
        try:
            p = KimiProvider()
            print("[LLMBrain] Using Kimi K2.5 provider.")
            return p
        except Exception as e:
            print(f"[LLMBrain] Kimi unavailable ({e}), falling back to Mock.")
            return MockProvider()

    if provider_type == "ollama":
        try:
            p = OllamaProvider()
            print("[LLMBrain] Using Ollama provider.")
            return p
        except Exception as e:
            print(f"[LLMBrain] Ollama unavailable ({e}), falling back to Mock.")
            return MockProvider()

    if provider_type == "groq":
        try:
            p = GroqProvider()
            print("[LLMBrain] Using Groq provider.")
            return p
        except Exception as e:
            print(f"[LLMBrain] Groq unavailable ({e}), falling back to Mock.")
            return MockProvider()

    if provider_type == "claude":
        try:
            p = ClaudeProvider()
            print("[LLMBrain] Using Claude provider.")
            return p
        except Exception as e:
            print(f"[LLMBrain] Claude unavailable ({e}), falling back to Mock.")
            return MockProvider()

    if provider_type == "auto":
        chain: list[LLMProvider] = []
        for cls, name in [
            (ClaudeProvider, "Claude"),
            (KimiProvider, "Kimi"),
            (GroqProvider, "Groq"),
            (OllamaProvider, "Ollama"),
        ]:
            try:
                chain.append(cls())
                print(f"[LLMBrain] + {name} added to fallback chain.")
            except Exception as e:
                print(f"[LLMBrain] {name} not available: {e}")
        if not chain:
            print("[LLMBrain] No real providers found. Using Mock.")
            return MockProvider()
        if len(chain) == 1:
            return chain[0]
        return FallbackChainProvider(chain)

    return MockProvider()


# ---------------------------------------------------------------------------
# LLMBrain - the public reasoning interface
# ---------------------------------------------------------------------------

class LLMBrain:
    """Provider-agnostic reasoning layer: plan, reflect, fix."""

    def __init__(self, provider_type: str = "mock"):
        self.provider = _build_provider(provider_type)

    def think(self, system_prompt: str, user_prompt: str) -> str:
        return self.provider.generate(system_prompt, user_prompt)

    # ------------------------------------------------------------------ plan

    def plan(
        self,
        user_goal: str,
        skill_context: str = "",
        critical_failures: list[dict] | None = None,
        env_context: str = "",
        winning_fixes: list[dict] | None = None,
        run_learnings: list[dict] | None = None,
        strategy_context: str = "",
    ) -> list[dict]:
        critical_ctx = ""
        if critical_failures:
            critical_ctx = "\nCRITICAL FAILURES from previous sessions (avoid repeating):\n"
            for f in critical_failures[-3:]:
                critical_ctx += f"  - Tool: {f.get('tool')}, Error: {f.get('error')}\n"

        wins_ctx = ""
        if winning_fixes:
            wins_ctx = "\nPROVEN FIX PATTERNS (prefer these when debugging):\n"
            for w in winning_fixes[:5]:
                wins_ctx += f"  - Error: {w.get('error_type')}, Fix: {w.get('fix_summary')}\n"

        learned_ctx = ""
        if run_learnings:
            learned_ctx = "\nSUCCESS PATTERNS from past runs (apply these):\n"
            for l in run_learnings[-5:]:
                notes = l.get("notes", "")
                tools = l.get("tools_used", [])
                if notes and notes != "Completed successfully.":
                    learned_ctx += f"  - [{', '.join(tools)}] {notes}\n"

        system_prompt = (
            "You are the Orchestrator X Planner - a senior software architect.\n"
            "Decompose the user's goal into a dependency-aware, ordered list of JSON tasks.\n"
            "\nAvailable tools:\n"
            "  FileEngine     - actions: write | read | edit\n"
            "                   payload: {action, path, content?, old_str?, new_str?}\n"
            "  SystemOperator - run shell/CLI commands\n"
            "                   payload: {command, cwd?}\n"
            "  DeployAgent    - launch a web app and return its URL\n"
            "                   payload: {file, host?, port?}\n"
            "  GitTool        - git operations: status | diff | log | add | commit | branch | show\n"
            "                   payload: {action, files?, message?, n?, staged?, ref?, cwd?}\n"
            "  WebSearchTool  - search the web for information\n"
            "                   payload: {query, max_results?}\n"
            "\nTask schema:\n"
            '  {"id": "unique-id", "description": "...", "tool": "...", '
            '"payload": {...}, "depends_on": ["id-of-prior-task"]}\n'
            "CRITICAL: always add depends_on when a task needs output from a prior task.\n"
            "  Example: if task B runs a file that task A writes, B must depends_on A's id.\n"
            "  Omit depends_on only for tasks that are fully independent.\n"
            "\nReturn ONLY a valid JSON array. No markdown, no explanation.\n"
            f"{critical_ctx}"
            f"{wins_ctx}"
            f"{learned_ctx}"
        )
        if strategy_context:
            system_prompt += "\n" + strategy_context + "\n"
        if env_context:
            system_prompt += "\nEnvironment:\n" + env_context + "\n"
        if skill_context:
            system_prompt += "\nSkills to apply:\n" + skill_context + "\n"

        response = self.think(system_prompt, user_goal)
        return self._extract_json_array(response) or []

    # --------------------------------------------------------------- reflect

    def reflect(
        self,
        task: dict,
        error_excerpt: str,
        previous_fix_summary: str,
    ) -> dict:
        """Ask why the last fix failed and what to do differently."""
        system_prompt = (
            "You are a reflective Python debugger.\n"
            "Given a task, an error, and the previous fix attempt that FAILED, "
            "explain WHY the fix didn't work and propose a DIFFERENT approach.\n"
            "Return JSON only: {\"root_cause\": \"...\", \"different_approach\": \"...\"}"
        )
        user_prompt = json.dumps({
            "task": task,
            "error": error_excerpt,
            "previous_fix_attempted": previous_fix_summary,
        })
        response = self.think(system_prompt, user_prompt)
        return self._extract_json_object(response) or {
            "root_cause": "Unable to determine root cause.",
            "different_approach": "Rewrite the file with corrected logic.",
        }

    # ----------------------------------------------------------- propose_fix

    def propose_fix(
        self,
        failed_task: dict,
        failure_context: Dict[str, Any],
        previous_fixes: list[str],
        last_fix_summary: str,
        winning_fixes: list[dict] | None = None,
        role_context: str = "",
    ) -> dict:
        reflection: dict = {}
        if last_fix_summary:
            reflection = self.reflect(
                failed_task,
                failure_context.get("error_excerpt", ""),
                last_fix_summary,
            )
            print(f"[Reflection] Root cause: {reflection.get('root_cause', '-')}")
            print(f"[Reflection] New approach: {reflection.get('different_approach', '-')}")

        wins_hint = ""
        if winning_fixes:
            wins_hint = "\nPROVEN fixes from past sessions:\n"
            for w in winning_fixes[:3]:
                wins_hint += f"  - {w.get('error_type')}: {w.get('fix_summary')}\n"

        system_prompt = (
            (role_context + "\n\n") if role_context else ""
        ) + (
            "You are a senior Python developer and debugger.\n"
            "Given the failed task, the FULL error traceback, the source code, and prior fix attempts, "
            "return ONE JSON fix plan.\n"
            "Keys:\n"
            "  mode         - 'replace_text' or 'rewrite_file'\n"
            "  target_file  - path to the file to fix\n"
            "  old_text     - exact text to replace (replace_text mode)\n"
            "  new_text     - replacement text (replace_text mode)\n"
            "  new_content  - full file content (rewrite_file mode)\n"
            "  summary      - one-line explanation of what was fixed\n"
            "  error_type   - short label for the error class (e.g. NameError, SyntaxError)\n"
            "Prefer replace_text for targeted, minimal fixes.\n"
            "Use rewrite_file only when the logic is fundamentally broken.\n"
            "NEVER repeat a strategy that already failed.\n"
            + wins_hint
        )
        if reflection:
            system_prompt += "Root cause analysis: " + reflection.get("root_cause", "") + "\n"
        user_payload = {
            "failed_task": failed_task,
            "error_excerpt": failure_context.get("error_excerpt", ""),
            "target_file": failure_context.get("target_file", ""),
            "file_content": failure_context.get("file_content", ""),
            "previous_fixes_count": len(previous_fixes),
            "last_fix_summary": last_fix_summary,
            "reflection": reflection,
        }
        response = self.think(system_prompt, json.dumps(user_payload))
        plan = self._extract_json_object(response)
        if plan is None:
            return self._fallback_fix_plan(failure_context)
        return self._normalize_fix_plan(plan, failure_context)

    # -------------------------------------------------------- JSON helpers

    def _extract_json_array(self, text: str) -> list | None:
        start = text.find("[")
        end = text.rfind("]") + 1
        if start == -1 or end <= start:
            return None
        try:
            data = json.loads(text[start:end])
            return data if isinstance(data, list) else None
        except Exception:
            return None

    def _extract_json_object(self, text: str) -> dict | None:
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end <= start:
            return None
        try:
            data = json.loads(text[start : end + 1])
            return data if isinstance(data, dict) else None
        except Exception:
            return None

    def _normalize_fix_plan(self, plan: dict, failure_context: Dict[str, Any]) -> dict:
        normalized = {
            "mode": str(plan.get("mode", "replace_text")).strip(),
            "target_file": plan.get("target_file") or failure_context.get("target_file"),
            "old_text": plan.get("old_text"),
            "new_text": plan.get("new_text"),
            "new_content": plan.get("new_content"),
            "summary": str(plan.get("summary", "Generated fix plan.")),
            "error_type": str(plan.get("error_type", "unknown")),
        }
        if normalized["mode"] not in {"replace_text", "rewrite_file"}:
            normalized["mode"] = "replace_text"
        return normalized

    def _fallback_fix_plan(self, failure_context: Dict[str, Any]) -> dict:
        target_file = failure_context.get("target_file")
        code = str(failure_context.get("file_content", ""))
        err = str(failure_context.get("error_excerpt", ""))
        if "pritn" in code or "NameError" in err:
            return {"mode": "replace_text", "target_file": target_file,
                    "old_text": "pritn", "new_text": "print",
                    "summary": "Fallback: fixed typo pritn -> print."}
        return {"mode": "rewrite_file", "target_file": target_file,
                "new_content": code,
                "summary": "Fallback: no deterministic fix found."}

    # --------------------------------------------------------------- learn from success

    def reflect_on_success(self, goal: str, plan: list[dict]) -> dict:
        """
        After a successful run, extract reusable patterns.
        Returns {"pattern": "...", "tools_used": [...], "notes": "..."}
        """
        system_prompt = (
            "You are a learning agent reviewing a successful task execution.\n"
            "Given the original goal and the plan that succeeded, extract:\n"
            "  1. The core pattern that made this work (reusable insight)\n"
            "  2. Which tools were key\n"
            "  3. One-line note to help future runs of similar tasks\n"
            "Return JSON only: {\"pattern\": \"...\", \"tools_used\": [...], \"notes\": \"...\"}"
        )
        user_prompt = json.dumps({"goal": goal, "successful_plan": plan})
        response = self.think(system_prompt, user_prompt)
        return self._extract_json_object(response) or {
            "pattern": goal[:80],
            "tools_used": list({t.get("tool", "") for t in plan}),
            "notes": "Completed successfully.",
        }

    # ------------------------------------------------------------------ replan

    def replan(
        self,
        original_task: dict,
        reflection: dict,
        verification_reason: str,
        similar_fixes: list[dict] | None = None,
    ) -> dict:
        """
        Given a task that executed but FAILED verification, produce an updated
        task payload.  The brain reasons about the verification failure and
        reflection to make a targeted payload change.

        Returns a partial dict that should be merged into the working task:
          {"payload": {...updated payload...}, "replan_reason": "..."}
        """
        fixes_hint = ""
        if similar_fixes:
            fixes_hint = "\nMemory: similar past fixes that WORKED:\n"
            for f in similar_fixes[:3]:
                fixes_hint += f"  - {f.get('error_type')}: {f.get('fix_summary')}\n"

        system_prompt = (
            "You are a task replanner for an autonomous coding agent.\n"
            "A task executed successfully (exit code 0) but FAILED post-execution verification.\n"
            "Given the original task, the verification failure reason, and a reflection, "
            "produce an updated task payload that addresses the verification failure.\n"
            "Return JSON with keys:\n"
            "  payload  - the updated task payload dict (same structure as original)\n"
            "  reason   - one-line explanation of what you changed\n"
            "Return ONLY valid JSON, no markdown.\n"
            + fixes_hint
        )
        user_prompt = json.dumps({
            "original_task": original_task,
            "verification_failure": verification_reason,
            "reflection": reflection,
        })
        response = self.think(system_prompt, user_prompt)
        result = self._extract_json_object(response)
        if result and "payload" in result:
            return result
        # Fallback: return original task unchanged
        return {"payload": original_task.get("payload", {}), "reason": "could not replan"}
