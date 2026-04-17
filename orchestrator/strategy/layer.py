from __future__ import annotations

"""
StrategyLayer - Orchestrator X

Runs BEFORE the planner. Classifies the goal into a strategy that tells the
planner:
  * What kind of task this is (web_api, cli, data, debug, research, generic)
  * Which stack to use (FastAPI, Flask, Streamlit, plain Python, ...)
  * Complexity estimate (simple / medium / complex)
  * Which agent roles are needed
  * Concrete hints to inject into the plan (auth patterns, health endpoints, ...)

100% rule-based - no extra LLM call, always fast, deterministic.
The planner's system prompt is enriched with this strategy so the first
attempt is already well-targeted.
"""

import re
from dataclasses import dataclass, field


# ---------------------------------------------------------------------------
# Task types
# ---------------------------------------------------------------------------

TASK_TYPES = {
    "web_api":   "Web API / backend service",
    "cli":       "CLI tool / script",
    "data":      "Data processing / analysis",
    "debug":     "Bug investigation / fix",
    "research":  "Research / web search",
    "ml":        "Machine learning / AI model",
    "generic":   "General Python task",
}

STACKS = {
    "fastapi":   "FastAPI + uvicorn",
    "flask":     "Flask",
    "streamlit": "Streamlit",
    "django":    "Django",
    "plain":     "Plain Python",
    "unknown":   "Unknown / TBD",
}


# ---------------------------------------------------------------------------
# Keyword signal tables
# ---------------------------------------------------------------------------

_WEB_API_SIGNALS = re.compile(
    r"\b(api|endpoint|route|rest|http|server|backend|fastapi|flask|django|"
    r"uvicorn|crud|post|get|put|delete|request|response|json\s+api|"
    r"web\s+server|microservice)\b",
    re.I,
)
_CLI_SIGNALS = re.compile(
    r"\b(cli|command[\s-]?line|script|argparse|click|typer|terminal|"
    r"shell\s+script|batch|run\s+a\s+(python|script))\b",
    re.I,
)
_DATA_SIGNALS = re.compile(
    r"\b(csv|dataframe|pandas|numpy|plot|chart|graph|analytics|etl|"
    r"pipeline|process\s+(data|file)|parse|transform|aggregate)\b",
    re.I,
)
_DEBUG_SIGNALS = re.compile(
    r"\b(fix|debug|bug|error|broken|crash|traceback|exception|"
    r"not\s+working|failing|investigate)\b",
    re.I,
)
_RESEARCH_SIGNALS = re.compile(
    r"\b(search|research|find\s+information|look\s+up|summarize|"
    r"what\s+is|how\s+does|explain|web\s+search)\b",
    re.I,
)
_ML_SIGNALS = re.compile(
    r"\b(machine\s+learning|ml|model|train|neural|pytorch|tensorflow|"
    r"sklearn|scikit|bert|gpt|llm|embedding|fine.?tun)\b",
    re.I,
)

# Stack detection
_FASTAPI_SIGNALS  = re.compile(r"\b(fastapi|uvicorn|pydantic)\b", re.I)
_FLASK_SIGNALS    = re.compile(r"\b(flask)\b", re.I)
_STREAMLIT_SIGNALS = re.compile(r"\b(streamlit|dashboard|ui|frontend)\b", re.I)
_DJANGO_SIGNALS   = re.compile(r"\b(django)\b", re.I)

# Feature detection
_AUTH_SIGNALS     = re.compile(r"\b(auth|jwt|login|token|oauth|bearer|password|user)\b", re.I)
_DB_SIGNALS       = re.compile(r"\b(database|db|sql|sqlite|postgres|mysql|mongo|redis|orm)\b", re.I)
_DEPLOY_SIGNALS   = re.compile(r"\b(deploy|run|start|launch|serve|host)\b", re.I)
_TEST_SIGNALS     = re.compile(r"\b(test|spec|pytest|unittest|coverage|tdd)\b", re.I)
_DOCKER_SIGNALS   = re.compile(r"\b(docker|container|dockerfile|compose)\b", re.I)
_HEALTH_SIGNALS   = re.compile(r"\b(health|monitor|status\s+check|healthcheck)\b", re.I)

# Complexity signals
_COMPLEX_SIGNALS  = re.compile(
    r"\b(jwt|oauth|database|auth|deploy|docker|microservice|"
    r"distributed|async|background\s+task|websocket|streaming)\b",
    re.I,
)
_SIMPLE_SIGNALS   = re.compile(
    r"\b(hello\s+world|simple|basic|quick|example|demo|"
    r"fibonacci|fib|reverse|palindrome|calculator)\b",
    re.I,
)


# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------

@dataclass
class StrategyResult:
    task_type:    str          # web_api | cli | data | debug | research | ml | generic
    stack:        str          # fastapi | flask | streamlit | django | plain | unknown
    complexity:   str          # simple | medium | complex
    needs_auth:   bool = False
    needs_db:     bool = False
    needs_deploy: bool = False
    needs_tests:  bool = False
    needs_docker: bool = False
    needs_health: bool = False
    agent_team:   list[str] = field(default_factory=list)
    hints:        list[str] = field(default_factory=list)
    confidence:   float = 0.5

    def to_prompt_block(self) -> str:
        """Format as a concise block for LLM system prompts."""
        lines = [
            "STRATEGY ANALYSIS (pre-plan classification):",
            f"  Task type  : {self.task_type} - {TASK_TYPES.get(self.task_type, '')}",
            f"  Stack      : {STACKS.get(self.stack, self.stack)}",
            f"  Complexity : {self.complexity}",
            f"  Agent team : {', '.join(self.agent_team)}",
        ]
        features = [
            k.replace("needs_", "")
            for k in ("needs_auth", "needs_db", "needs_deploy", "needs_tests",
                      "needs_docker", "needs_health")
            if getattr(self, k)
        ]
        if features:
            lines.append(f"  Features   : {', '.join(features)}")
        if self.hints:
            lines.append("  Planner hints:")
            for h in self.hints:
                lines.append(f"    * {h}")
        return "\n".join(lines)

    def to_dict(self) -> dict:
        return {
            "task_type":    self.task_type,
            "stack":        self.stack,
            "complexity":   self.complexity,
            "needs_auth":   self.needs_auth,
            "needs_db":     self.needs_db,
            "needs_deploy": self.needs_deploy,
            "needs_tests":  self.needs_tests,
            "needs_docker": self.needs_docker,
            "needs_health": self.needs_health,
            "agent_team":   self.agent_team,
            "hints":        self.hints,
            "confidence":   self.confidence,
        }


# ---------------------------------------------------------------------------
# StrategyLayer
# ---------------------------------------------------------------------------

class StrategyLayer:
    """
    Classifies a goal into a StrategyResult without any LLM call.
    Call `analyze(goal)` before `brain.plan()` and inject the result
    via `result.to_prompt_block()`.
    """

    def analyze(self, goal: str) -> StrategyResult:
        g = goal.strip()

        task_type  = self._classify_task(g)
        stack      = self._pick_stack(g, task_type)
        complexity = self._estimate_complexity(g)

        needs_auth   = bool(_AUTH_SIGNALS.search(g))
        needs_db     = bool(_DB_SIGNALS.search(g))
        needs_deploy = bool(_DEPLOY_SIGNALS.search(g)) or task_type == "web_api"
        needs_tests  = bool(_TEST_SIGNALS.search(g))
        needs_docker = bool(_DOCKER_SIGNALS.search(g))
        needs_health = bool(_HEALTH_SIGNALS.search(g)) or task_type == "web_api"

        agent_team = self._compose_team(
            task_type, complexity, needs_auth, needs_db, needs_tests, needs_deploy
        )
        hints      = self._generate_hints(
            task_type, stack, complexity,
            needs_auth, needs_db, needs_deploy, needs_tests, needs_health
        )
        confidence = self._confidence_score(g, task_type)

        return StrategyResult(
            task_type=task_type,
            stack=stack,
            complexity=complexity,
            needs_auth=needs_auth,
            needs_db=needs_db,
            needs_deploy=needs_deploy,
            needs_tests=needs_tests,
            needs_docker=needs_docker,
            needs_health=needs_health,
            agent_team=agent_team,
            hints=hints,
            confidence=confidence,
        )

    # ---------------------------------------------------------------- classify

    def _classify_task(self, goal: str) -> str:
        scores: dict[str, int] = {
            "web_api":  len(_WEB_API_SIGNALS.findall(goal)),
            "cli":      len(_CLI_SIGNALS.findall(goal)),
            "data":     len(_DATA_SIGNALS.findall(goal)),
            "debug":    len(_DEBUG_SIGNALS.findall(goal)),
            "research": len(_RESEARCH_SIGNALS.findall(goal)),
            "ml":       len(_ML_SIGNALS.findall(goal)),
        }
        best = max(scores, key=lambda k: scores[k])
        return best if scores[best] > 0 else "generic"

    def _pick_stack(self, goal: str, task_type: str) -> str:
        if _DJANGO_SIGNALS.search(goal):   return "django"
        if _FASTAPI_SIGNALS.search(goal):  return "fastapi"
        if _FLASK_SIGNALS.search(goal):    return "flask"
        if _STREAMLIT_SIGNALS.search(goal): return "streamlit"
        # Default for web_api when no explicit framework named
        if task_type == "web_api":         return "fastapi"
        return "plain"

    def _estimate_complexity(self, goal: str) -> str:
        complex_hits = len(_COMPLEX_SIGNALS.findall(goal))
        simple_hits  = len(_SIMPLE_SIGNALS.findall(goal))
        word_count   = len(goal.split())

        if complex_hits >= 2 or word_count > 25:
            return "complex"
        if simple_hits >= 1 and complex_hits == 0:
            return "simple"
        return "medium"

    # ---------------------------------------------------------------- team

    def _compose_team(
        self,
        task_type: str,
        complexity: str,
        needs_auth: bool,
        needs_db: bool,
        needs_tests: bool,
        needs_deploy: bool,
    ) -> list[str]:
        team = ["Architect", "Coder"]

        if complexity in ("medium", "complex") or needs_auth or needs_db:
            # Keep Architect for complex tasks; strip for simple ones
            pass
        else:
            team = ["Coder"]

        if needs_tests or complexity == "complex":
            team.append("Tester")

        # Fixer is always on standby - not listed but always active
        if needs_deploy or task_type == "web_api":
            team.append("Deployer")

        return team

    # ---------------------------------------------------------------- hints

    def _generate_hints(
        self,
        task_type: str,
        stack: str,
        complexity: str,
        needs_auth: bool,
        needs_db: bool,
        needs_deploy: bool,
        needs_tests: bool,
        needs_health: bool,
    ) -> list[str]:
        hints: list[str] = []

        # Stack-specific (skip for debug/research - no new stack being built)
        if stack == "fastapi":
            hints.append("Use FastAPI with uvicorn. Bind to host='127.0.0.1' (not 0.0.0.0) on Windows.")
            if needs_health:
                hints.append("Include a GET /health endpoint returning {'status': 'ok'}.")

        elif stack == "flask":
            hints.append("Use Flask. Run with app.run(host='127.0.0.1', debug=False).")

        elif stack == "streamlit":
            hints.append("Use Streamlit. Entry point: streamlit run <file>.")

        elif stack == "plain" and task_type not in ("debug", "research", "generic"):
            hints.append("Plain Python script - no web framework needed.")

        # Auth
        if needs_auth:
            if stack in ("fastapi", "flask"):
                hints.append("Implement JWT auth: POST /auth/token returns bearer token; protect routes with Depends().")
            else:
                hints.append("Implement auth with hashed passwords (passlib/bcrypt).")

        # Database
        if needs_db:
            hints.append("Use SQLite with SQLAlchemy for simplicity unless Postgres is explicitly requested.")

        # Tests
        if needs_tests:
            hints.append("Write pytest tests in a test_*.py file; use TestClient (FastAPI) or test_client (Flask).")

        # Complexity hints
        if complexity == "complex":
            hints.append("Break implementation into: schema/models -> business logic -> routes -> tests -> deploy.")

        # Debug task
        if task_type == "debug":
            hints.append("First READ the buggy file, IDENTIFY the root cause, then write a targeted fix. Don't rewrite the whole file.")

        # Research task
        if task_type == "research":
            hints.append("Use WebSearchTool to gather info before writing any code.")

        # Deploy
        if needs_deploy and stack == "fastapi":
            hints.append("DeployAgent will handle uvicorn launch. Do NOT add --reload flag on Windows.")

        return hints

    # ---------------------------------------------------------------- confidence

    def _confidence_score(self, goal: str, task_type: str) -> float:
        """Higher score = more signal in the goal text."""
        signal_map = {
            "web_api":  _WEB_API_SIGNALS,
            "cli":      _CLI_SIGNALS,
            "data":     _DATA_SIGNALS,
            "debug":    _DEBUG_SIGNALS,
            "research": _RESEARCH_SIGNALS,
            "ml":       _ML_SIGNALS,
            "generic":  None,
        }
        pattern = signal_map.get(task_type)
        if not pattern:
            return 0.4
        hits = len(pattern.findall(goal))
        # 1 hit -> 0.6, 2 -> 0.75, 3+ -> 0.9
        return min(0.9, 0.5 + hits * 0.15)
