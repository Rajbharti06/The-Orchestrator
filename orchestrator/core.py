from __future__ import annotations

"""
OrchestratorCore X

Capabilities:
  * EnvironmentProbe   - captured once at startup, injected into every LLM call
  * AutoInstaller      - pip-installs missing imports before execution
  * DeployAgent        - registered as a first-class tool; runs apps and returns URLs
  * DAG executor       - tasks carry optional depends_on; execution respects order
  * Persistent intel   - winning fix patterns fed back to Fix Agent across sessions
  * Success tracking   - records what worked so the brain learns over time
"""

import copy
import hashlib
import uuid
from pathlib import Path

from .config import MAX_RETRIES, SWARM_MAX_WORKERS, APPROVAL_MODE
from .execution.auto_installer import AutoInstaller
from .execution.env_probe import EnvironmentProbe
from .execution.executor import RuntimeExecutor
from .execution.llm_brain import LLMBrain
from .execution.memory_engine import MemoryEngine
from .execution.skills import select_skills, skill_count, list_skill_names
from .execution.tool_registry import ExecutionResult, ToolRegistry
from .execution.tools.DeployAgent import DeployAgent
from .execution.tools.FileEngine import FileEngine
from .execution.tools.GitTool import GitTool
from .execution.tools.SystemOperator import SystemOperator
from .execution.tools.WebSearchTool import WebSearchTool
from .execution.validators import SyntaxValidator, verify_task
from .agents.roles import RoleRouter
from .swarm.manager import SwarmManager
from .strategy import StrategyLayer


class OrchestratorCore:
    """
    provider_type options:
        "mock"   - deterministic, no API key needed (great for testing)
        "claude" - Anthropic Claude  (ANTHROPIC_API_KEY env var)
        "groq"   - Groq fast inference (GROQ_API_KEY env var)
        "ollama" - local Ollama instance
        "auto"   - Claude -> Groq -> Ollama -> Mock fallback chain
    """

    def __init__(self, provider_type: str = "mock", approval_mode: str = APPROVAL_MODE):
        self.session_id = uuid.uuid4().hex
        self.approval_mode = approval_mode  # auto | suggest | manual

        # Tools
        self.registry = ToolRegistry()
        self.registry.register(FileEngine())
        self.registry.register(SystemOperator())
        self.registry.register(DeployAgent())
        self.registry.register(GitTool())
        self.registry.register(WebSearchTool())

        self.executor = RuntimeExecutor(self.registry)
        self.memory = MemoryEngine(self.session_id)
        self.brain = LLMBrain(provider_type=provider_type)
        self.swarm = SwarmManager(self.executor, max_workers=SWARM_MAX_WORKERS)
        self.role_router = RoleRouter()
        self.strategy_layer = StrategyLayer()
        self.max_retries = MAX_RETRIES

        # Capture environment once - injected into every LLM call
        print("[Orchestrator] Probing environment ...")
        self.env = EnvironmentProbe.capture()
        self.env_context = EnvironmentProbe.format_for_llm(self.env)

        # AutoInstaller pre-loaded with known packages
        self.installer = AutoInstaller(
            known_packages=self.env.get("installed_packages", {})
        )

    # ================================================================= public

    def run_prompt(self, prompt: str, agents_context: str = "") -> None:
        print(f"\n[Orchestrator X] Session: {self.session_id}")
        print(f"Goal: {prompt}\n")

        # Skill injection - uses 889-skill catalog when available
        skill_context = select_skills(prompt)
        if agents_context:
            skill_context = agents_context + "\n\n" + skill_context
        matched_skills = list_skill_names(prompt)
        if matched_skills:
            print(f"[Skills] {len(matched_skills)} skill(s) injected from catalog ({skill_count()} total): "
                  f"{', '.join(matched_skills) or 'built-in'}")

        # Strategy analysis - classify goal BEFORE planning
        strategy = self.strategy_layer.analyze(prompt)
        print(f"[Strategy] {strategy.task_type} | {strategy.stack} | "
              f"{strategy.complexity} | team: {', '.join(strategy.agent_team)} "
              f"(confidence: {strategy.confidence:.0%})")
        strategy_context = strategy.to_prompt_block()

        # Pull cross-session intelligence
        critical_failures = self.memory.get_critical_failures()
        winning_fixes = self.memory.get_winning_fix_patterns()
        run_learnings = self.memory.get_run_learnings()
        if critical_failures:
            print(f"[Memory] {len(critical_failures)} critical failure(s) loaded.")
        if winning_fixes:
            print(f"[Memory] {len(winning_fixes)} winning fix pattern(s) loaded.")
        if run_learnings:
            print(f"[Memory] {len(run_learnings)} success pattern(s) loaded.")

        # Plan - enriched with strategy context
        print("Thinking ... Generating dependency-aware plan.")
        plan = self.brain.plan(
            user_goal=prompt,
            skill_context=skill_context,
            critical_failures=critical_failures,
            env_context=self.env_context,
            winning_fixes=winning_fixes,
            run_learnings=run_learnings,
            strategy_context=strategy_context,
        )

        if not plan:
            print("Planner returned no tasks.")
            return

        print(f"Plan: {len(plan)} task(s).\n")
        for i, t in enumerate(plan):
            deps = t.get("depends_on", [])
            dep_str = f" -> needs {deps}" if deps else ""
            role = self.role_router.route(t.get("description", ""))
            print(f"  [{i+1}] [{role.name}] {t.get('description', '?')}{dep_str}")
        print()

        # Execute in dependency order
        self._run_dag(plan, winning_fixes=winning_fixes)

        print("\n[Orchestrator X] Session complete.")

        # Post-run intelligence: learn from success
        self._learn_from_run(prompt, plan)
        self.memory.save()

    def _learn_from_run(self, goal: str, plan: list[dict]) -> None:
        """Reflect on the completed run and store reusable patterns."""
        try:
            learning = self.brain.reflect_on_success(goal, plan)
            self.memory.record_run_learning(learning)
            notes = learning.get("notes", "")
            if notes:
                print(f"[Learning] {notes}")
        except Exception:
            pass  # never crash the main loop on learning failure

    def plan_only(self, prompt: str, agents_context: str = "") -> list[dict]:
        """Return the plan without executing anything - for /plan slash command."""
        skill_context = select_skills(prompt)
        if agents_context:
            skill_context = agents_context + "\n\n" + skill_context
        strategy = self.strategy_layer.analyze(prompt)
        critical_failures = self.memory.get_critical_failures()
        winning_fixes = self.memory.get_winning_fix_patterns()
        run_learnings = self.memory.get_run_learnings()
        return self.brain.plan(
            user_goal=prompt,
            skill_context=skill_context,
            critical_failures=critical_failures,
            env_context=self.env_context,
            winning_fixes=winning_fixes,
            run_learnings=run_learnings,
            strategy_context=strategy.to_prompt_block(),
        )

    # ================================================================ dag

    def _run_dag(self, plan: list[dict], winning_fixes: list[dict]) -> None:
        """
        Topological execution with swarm acceleration.

        Independent tasks (no depends_on, not DeployAgent) are dispatched
        to the SwarmManager and run in parallel.  Everything else runs
        sequentially with the retry/fix loop.
        """
        completed: set[str] = set()
        failed: set[str] = set()

        # ── Phase 1: swarm independent tasks ─────────────────────────────
        parallel_tasks, sequential_plan = self.swarm.partition(plan)

        if parallel_tasks:
            # Gate: approve before launching (ask sequentially, run in parallel)
            approved = [t for t in parallel_tasks if self._approve(t)]
            skipped_count = len(parallel_tasks) - len(approved)
            if skipped_count:
                print(f"[Approval] {skipped_count} task(s) skipped by user.")
            parallel_tasks = approved

        if parallel_tasks:
            print(f"\n[Swarm] Running {len(parallel_tasks)} independent task(s) in parallel ...")
            report = self.swarm.run_parallel(parallel_tasks)

            for task in parallel_tasks:
                tid = str(task.get("id", task.get("description", id(task))))
                if task in report.succeeded:
                    completed.add(tid)
                    self.memory.record_action(
                        tool=task.get("tool", ""),
                        payload=str(task.get("payload", "")),
                        success=True,
                    )
                else:
                    failed.add(tid)
                    self.memory.record_action(
                        tool=task.get("tool", ""),
                        payload=str(task.get("payload", "")),
                        success=False,
                        error="Swarm task failed",
                    )

        # ── Phase 2: sequential tasks (deps, deploy, forced) ─────────────
        for task in sequential_plan:
            tid = str(task.get("id", task.get("description", id(task))))
            deps = task.get("depends_on", [])

            blocked = [d for d in deps if d in failed]
            if blocked:
                print(f"\nSkipping '{task.get('description')}' - dependency failed: {blocked}")
                failed.add(tid)
                continue

            waiting = [d for d in deps if d not in completed]
            if waiting:
                print(f"\nSkipping '{task.get('description')}' - unmet dependency: {waiting}")
                failed.add(tid)
                continue

            success = self._execute_with_retry(task, winning_fixes=winning_fixes)
            if success:
                completed.add(tid)
            else:
                failed.add(tid)
                print(f"Pipeline halted at: {task.get('description')}")
                break

    # ============================================================== retry loop

    def _execute_with_retry(
        self,
        task: dict,
        winning_fixes: list[dict] | None = None,
    ) -> bool:
        working_task = copy.deepcopy(task)
        retries = 0
        fix_history: list[str] = []
        last_fix_summary = ""

        role = self.role_router.route(working_task.get("description", ""))

        while retries < self.max_retries:
            print(f"\n--- [{role.name}] {working_task.get('description', '?')} (Attempt {retries + 1}) ---")

            # Auto-install missing imports before running Python files
            self._maybe_auto_install(working_task)

            # Approval gate
            if not self._approve(working_task):
                print(f"[Approval] Skipped by user: {working_task.get('description')}")
                return False

            # Static syntax check before wasting a subprocess call
            pre_error = self._pre_validate(working_task)
            if pre_error:
                print(f"[Validator] Syntax error caught before execution:")
                print(f"  {pre_error}")
                result = _make_synthetic_failure(working_task, pre_error,
                                                  {"pre_validation_error": pre_error})
            else:
                result = self.executor.perform(working_task["tool"], working_task["payload"])

            self.memory.record_action(
                tool=working_task["tool"],
                payload=str(working_task["payload"]),
                success=result.success,
                error=result.error,
            )

            if result.success:
                # ── VERIFY: go beyond exit-code-0 ────────────────────────
                verification = verify_task(working_task, result)
                if verification.passed:
                    self._on_success(working_task, result, last_fix_summary)
                    return True

                # Verification failed - REFLECT + REPLAN
                print(f"[Verifier] Outcome check failed (confidence {verification.confidence:.0%}): "
                      f"{verification.reason[:200]}")

                similar_fixes = self.memory.search_similar_fix(verification.reason)
                if similar_fixes:
                    print(f"[Memory]   Found {len(similar_fixes)} similar fix(es) in history.")

                reflection = self.brain.reflect(
                    task=working_task,
                    error_excerpt=verification.reason,
                    previous_fix_summary=last_fix_summary,
                )
                print(f"[Reflect]  Root cause: {reflection.get('root_cause', '-')}")
                print(f"[Reflect]  New approach: {reflection.get('different_approach', '-')}")

                replan = self.brain.replan(
                    original_task=working_task,
                    reflection=reflection,
                    verification_reason=verification.reason,
                    similar_fixes=similar_fixes,
                )
                if replan.get("payload"):
                    working_task = {**working_task, "payload": replan["payload"]}
                    print(f"[Replan]   {replan.get('reason', '-')}")

                self.memory.record_fix_pattern(
                    error_type="verification_failure",
                    fix_mode="replan",
                    fix_summary=replan.get("reason", verification.reason),
                    worked=False,
                )
                retries += 1
                continue

            # ── FIX AGENT: execution itself failed ───────────────────────
            failure_context = self._build_failure_context(working_task, result)
            print("[Fix Agent] Analyzing failure ...")
            if failure_context.get("error_excerpt"):
                print(f"  {failure_context['error_excerpt'][:300]}")

            from .agents.roles import FIXER
            fix_plan = self.brain.propose_fix(
                failed_task=working_task,
                failure_context=failure_context,
                previous_fixes=fix_history,
                last_fix_summary=last_fix_summary,
                winning_fixes=winning_fixes,
                role_context=FIXER.system_prompt,
            )

            fingerprint = hashlib.sha256(str(fix_plan).encode()).hexdigest()
            if fingerprint in fix_history:
                print("[Fix Agent] Same fix repeated - escalating.")
                fix_plan = self._escalate_fix_strategy(working_task, result, failure_context)
                fingerprint = hashlib.sha256(str(fix_plan).encode()).hexdigest()

            print(f"Fix: {fix_plan.get('summary', '-')}")
            applied = self._apply_fix_plan(working_task, fix_plan)
            if not applied:
                print("[Fix Agent] Could not apply fix plan.")

            # Record the fix attempt (worked=False here; updated to True on success)
            self.memory.record_fix_pattern(
                error_type=fix_plan.get("error_type", "unknown"),
                fix_mode=fix_plan.get("mode", "unknown"),
                fix_summary=fix_plan.get("summary", ""),
                worked=False,
            )

            fix_history.append(fingerprint)
            last_fix_summary = str(fix_plan.get("summary", ""))
            retries += 1

        print(f"FAILED after {self.max_retries} attempts: {working_task.get('description')}")
        return False

    # ====================================================== approval gate

    _SUGGEST_TOOLS = {"SystemOperator", "DeployAgent", "GitTool"}

    def _approve(self, task: dict) -> bool:
        """
        Return True if the task is allowed to run under the current approval_mode.
        auto   - always True
        suggest - ask for shell/deploy/git tools
        manual  - ask for everything
        """
        if self.approval_mode == "auto":
            return True

        tool = task.get("tool", "")
        needs_ask = (
            self.approval_mode == "manual" or
            (self.approval_mode == "suggest" and tool in self._SUGGEST_TOOLS)
        )
        if not needs_ask:
            return True

        payload = task.get("payload", {})
        print(f"\n  Tool   : {tool}")
        print(f"  Action : {task.get('description', '?')}")
        if isinstance(payload, dict):
            for k, v in list(payload.items())[:4]:
                print(f"  {k:<8}: {str(v)[:80]}")
        try:
            answer = input("  Execute? [Y/n] ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            return False
        return answer in ("", "y", "yes")

    # ================================================= pre-execution helpers

    def _maybe_auto_install(self, task: dict) -> None:
        """If the task runs a Python file, auto-install its imports first."""
        if task.get("tool") != "SystemOperator":
            return
        target = self._extract_target_file(task, {})
        if not target or not target.endswith(".py") or not Path(target).exists():
            return
        report = self.installer.check_and_install(target)
        if report.installed:
            print(f"[AutoInstaller] {report.summary()}")

    def _pre_validate(self, task: dict) -> str | None:
        """AST-check Python files before running them. Returns error string or None."""
        if task.get("tool") != "SystemOperator":
            return None
        command = str(task.get("payload", {}).get("command", ""))
        tokens = command.split()
        for i, tok in enumerate(tokens[:-1]):
            if tok.lower() in {"python", "python3", "python.exe", "py"}:
                target = tokens[i + 1]
                if Path(target).exists():
                    valid, err = SyntaxValidator.validate(target)
                    if not valid:
                        return err
        return None

    def _on_success(self, task: dict, result: ExecutionResult, last_fix_summary: str) -> None:
        """Post-success bookkeeping."""
        if task.get("tool") == "FileEngine" and task.get("payload", {}).get("action") == "write":
            self.memory.record_file(task["payload"]["path"])

        # If we succeeded after a fix, record it as a winning pattern
        if last_fix_summary:
            # Find the most recent unconfirmed fix pattern and mark it as worked
            for fp in reversed(self.memory.data["fix_patterns"]):
                if not fp["worked"] and fp["fix_summary"] == last_fix_summary:
                    fp["worked"] = True
                    break

        # Record deployed app URL
        if task.get("tool") == "DeployAgent":
            diag = result.diagnostics or {}
            url = diag.get("url", "")
            app_type = diag.get("app_type", "unknown")
            pid = diag.get("pid", -1)
            if url:
                self.memory.record_deployed_app(url, app_type, pid)
                print(f"\nApp live at: {url}")

    # ================================================= failure context

    def _build_failure_context(self, task: dict, result: ExecutionResult) -> dict:
        diagnostics = result.diagnostics or {}
        error_text = result.output or ""
        if result.error:
            error_text = f"{result.error}\n{error_text}".strip()

        target_file = self._extract_target_file(task, diagnostics)
        file_content = ""
        if target_file and Path(target_file).exists():
            try:
                file_content = Path(target_file).read_text(encoding="utf-8")
            except Exception:
                pass

        return {
            "error_excerpt": error_text[-4000:],
            "diagnostics": diagnostics,
            "target_file": target_file,
            "file_content": file_content,
            "recent_failures": self.memory.data.get("failures", [])[-3:],
        }

    def _extract_target_file(self, task: dict, diagnostics: dict) -> str | None:
        if task.get("tool") == "FileEngine":
            return task.get("payload", {}).get("path")

        command = str(task.get("payload", {}).get("command", ""))
        if not command:
            command = str(diagnostics.get("command", ""))

        tokens = command.split()
        for i, tok in enumerate(tokens[:-1]):
            if tok.lower() in {"python", "python3", "python.exe", "py"}:
                return tokens[i + 1]
        return None

    # ================================================= fix application

    def _apply_fix_plan(self, task: dict, fix_plan: dict) -> bool:
        mode = str(fix_plan.get("mode", "")).lower()
        target = fix_plan.get("target_file", "")

        # ── modify_command: patch the SystemOperator command in-place ──────
        if mode == "modify_command":
            new_cmd = fix_plan.get("new_command", "")
            if new_cmd and task.get("tool") == "SystemOperator":
                task["payload"] = {**task.get("payload", {}), "command": new_cmd}
                return True
            print(f"[Fix Agent] modify_command failed: no new_command or task is not SystemOperator")
            return False

        # ── file doesn't exist -> can't apply file-based fix ─────────────
        if not target:
            print("[Fix Agent] Fix plan missing target_file.")
            return False
        if not Path(target).exists():
            print(f"[Fix Agent] Target file not found: {target}")
            return False

        if mode == "replace_text":
            old, new = fix_plan.get("old_text"), fix_plan.get("new_text")
            if not isinstance(old, str) or not isinstance(new, str):
                print("[Fix Agent] replace_text missing old_text or new_text.")
                return False
            result = self.executor.perform("FileEngine", {
                "action": "edit", "path": target,
                "old_str": old, "new_str": new,
            })
            if not result.success:
                print(f"[Fix Agent] replace_text failed: {result.error}")
            return result.success

        if mode == "rewrite_file":
            content = fix_plan.get("new_content")
            if not isinstance(content, str):
                print("[Fix Agent] rewrite_file missing new_content.")
                return False
            return self.executor.perform("FileEngine", {
                "action": "write", "path": target, "content": content,
            }).success

        print(f"[Fix Agent] Unknown fix mode: '{mode}'")
        return False

    def _escalate_fix_strategy(
        self, task: dict, result: ExecutionResult, ctx: dict
    ) -> dict:
        code = ctx.get("file_content") or ""
        target = ctx.get("target_file")
        if "pritn" in code and target:
            return {"mode": "replace_text", "target_file": target,
                    "old_text": "pritn", "new_text": "print",
                    "summary": "Escalation: deterministic pritn->print fix.",
                    "error_type": "NameError"}
        return {"mode": "rewrite_file", "target_file": target,
                "new_content": code,
                "summary": "Escalation: rewrote file unchanged as last resort.",
                "error_type": "unknown"}


# ================================================================== helpers

def _make_synthetic_failure(
    task: dict, error: str, diagnostics: dict
) -> ExecutionResult:
    return ExecutionResult(
        tool_name=task.get("tool", "unknown"),
        success=False,
        output="",
        error=error,
        diagnostics=diagnostics,
    )


if __name__ == "__main__":
    import sys
    orc = OrchestratorCore()
    goal = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else \
        "build orchestrator_test.py that prints hello from v3 and run it"
    orc.run_prompt(goal)
