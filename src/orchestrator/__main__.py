"""
Orchestrator X — entry point

Non-interactive (single shot):
    python -m src.orchestrator "build a FastAPI app and run it"
    python -m src.orchestrator --provider claude "..."
    python -m src.orchestrator --approval auto "..."

Interactive REPL (no args):
    python -m src.orchestrator

Inside the REPL:
    you> <any natural language goal>      — run a task
    you> !<shell command>                 — run shell directly
    you> /plan <goal>                     — show plan, don't execute
    you> /model <provider>               — switch model mid-session
    you> /status                          — show session info
    you> /review                          — last session summary from memory
    you> /approval auto|suggest|manual   — change approval mode
    you> /help                            — show commands
    you> /exit                            — quit
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

from .core import OrchestratorCore


# ---------------------------------------------------------------------------
# Provider auto-detection
# ---------------------------------------------------------------------------

def _detect_provider() -> str:
    if os.getenv("ANTHROPIC_API_KEY"):
        return "claude"
    if os.getenv("GROQ_API_KEY"):
        return "groq"
    try:
        import httpx
        r = httpx.get("http://localhost:11434/api/tags", timeout=2.0)
        models = [m["name"] for m in r.json().get("models", [])]
        if any("kimi" in m for m in models):
            return "kimi"
    except Exception:
        pass
    return "mock"


# ---------------------------------------------------------------------------
# AGENTS.md loader
# ---------------------------------------------------------------------------

def _load_agents_md(cwd: Path | None = None) -> str:
    """
    Load AGENTS.md from current dir (or any parent up to repo root).
    Returns empty string if not found.
    """
    search = cwd or Path.cwd()
    for directory in [search] + list(search.parents)[:3]:
        p = directory / "AGENTS.md"
        if p.exists():
            content = p.read_text(encoding="utf-8").strip()
            if content:
                print(f"[AGENTS.md] Loaded project instructions from {p}")
                return f"Project instructions from AGENTS.md:\n{content}"
    return ""


# ---------------------------------------------------------------------------
# Arg parsing (manual — no argparse to keep startup instant)
# ---------------------------------------------------------------------------

def _parse_args(argv: list[str]) -> dict:
    args = argv[:]
    provider = None
    approval = None

    for flag, key in [("--provider", "provider"), ("--approval", "approval")]:
        if flag in args:
            idx = args.index(flag)
            if idx + 1 < len(args):
                if key == "provider":
                    provider = args[idx + 1]
                else:
                    approval = args[idx + 1]
                args = args[:idx] + args[idx + 2:]

    goal = " ".join(args).strip()
    return {"provider": provider, "approval": approval, "goal": goal}


# ---------------------------------------------------------------------------
# Slash command handler
# ---------------------------------------------------------------------------

def _handle_slash(cmd: str, core: OrchestratorCore, agents_ctx: str) -> bool:
    """Handle /command. Returns False if user typed /exit."""
    parts = cmd.split(None, 1)
    name = parts[0].lower()
    arg = parts[1] if len(parts) > 1 else ""

    if name == "/exit" or name == "/quit":
        print("Bye.")
        return False

    if name == "/help":
        print("""
Commands:
  /plan <goal>              Show plan without executing
  /model <provider>         Switch provider (claude/groq/kimi/ollama/mock)
  /approval auto|suggest|manual   Change approval mode
  /status                   Session info
  /review                   Last session fix history
  /exit                     Quit
  !<command>                Run shell command directly
""")

    elif name == "/plan":
        if not arg:
            print("Usage: /plan <goal>")
        else:
            print(f"\nPlanning (no execution): {arg}")
            plan = core.plan_only(arg, agents_ctx)
            if not plan:
                print("Planner returned no tasks.")
            else:
                print(f"{len(plan)} task(s):")
                for i, t in enumerate(plan):
                    deps = t.get("depends_on", [])
                    dep_str = f" → needs {deps}" if deps else ""
                    print(f"  [{i+1}] [{t.get('tool','?')}] {t.get('description','?')}{dep_str}")

    elif name == "/model":
        if not arg:
            print(f"Current provider: {type(core.brain.provider).__name__}")
        else:
            from .execution.llm_brain import LLMBrain
            core.brain = LLMBrain(provider_type=arg)
            print(f"Switched to provider: {arg}")

    elif name == "/approval":
        if arg not in ("auto", "suggest", "manual"):
            print("Usage: /approval auto|suggest|manual")
        else:
            core.approval_mode = arg
            print(f"Approval mode: {arg}")

    elif name == "/status":
        print(f"""
Session : {core.session_id}
Provider: {type(core.brain.provider).__name__}
Approval: {core.approval_mode}
Memory  : {core.memory.session_path}
""")

    elif name == "/review":
        failures = core.memory.get_critical_failures()
        wins = core.memory.get_winning_fix_patterns()
        print(f"\nCritical failures tracked: {len(failures)}")
        for f in failures[-5:]:
            print(f"  - {f.get('tool')}: {str(f.get('error',''))[:60]}")
        print(f"Winning fix patterns: {len(wins)}")
        for w in wins[:5]:
            print(f"  - {w.get('error_type')}: {w.get('fix_summary','')[:60]}")

    else:
        print(f"Unknown command: {name}  (try /help)")

    return True


# ---------------------------------------------------------------------------
# Interactive REPL
# ---------------------------------------------------------------------------

_BANNER = """
╔══════════════════════════════════════════╗
║          Orchestrator X  REPL            ║
║  /help for commands  •  /exit to quit    ║
╚══════════════════════════════════════════╝"""


def _run_repl(core: OrchestratorCore, agents_ctx: str) -> None:
    print(_BANNER)
    print(f"  Provider : {type(core.brain.provider).__name__}")
    print(f"  Approval : {core.approval_mode}")
    if agents_ctx:
        print("  AGENTS.md: loaded")
    print()

    while True:
        try:
            line = input("you> ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nBye.")
            break

        if not line:
            continue

        # Shell passthrough
        if line.startswith("!"):
            shell_cmd = line[1:].strip()
            try:
                result = subprocess.run(shell_cmd, shell=True, text=True,
                                        capture_output=False)
                if result.returncode != 0:
                    print(f"[Shell] exited {result.returncode}")
            except Exception as exc:
                print(f"[Shell] Error: {exc}")
            continue

        # Slash commands
        if line.startswith("/"):
            if not _handle_slash(line, core, agents_ctx):
                break
            continue

        # Normal goal
        core.run_prompt(line, agents_ctx)
        print()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parsed = _parse_args(sys.argv[1:])

    provider = parsed["provider"] or _detect_provider()
    approval = parsed["approval"] or "suggest"
    goal = parsed["goal"]

    core = OrchestratorCore(provider_type=provider, approval_mode=approval)
    agents_ctx = _load_agents_md()

    if goal:
        # Non-interactive single shot
        print(f"[Orchestrator X] Provider: {provider}  Approval: {approval}")
        core.run_prompt(goal, agents_ctx)
    else:
        # Interactive REPL
        _run_repl(core, agents_ctx)
