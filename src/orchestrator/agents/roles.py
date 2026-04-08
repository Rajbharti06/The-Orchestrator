from __future__ import annotations

"""
Built-in agent roles — Orchestrator X

Five specialized roles form an autonomous development team:
  Architect  → plans structure and dependencies
  Coder      → writes clean, working code
  Tester     → validates correctness with tests
  Fixer      → diagnoses and repairs failures
  Deployer   → ships code to a running environment

The RoleRouter assigns the best role to each task description.
"""

from .base import AgentRole


# ---------------------------------------------------------------------------
# Role definitions
# ---------------------------------------------------------------------------

ARCHITECT = AgentRole(
    name="Architect",
    description="Plans system structure, breaks tasks into clean sub-tasks with dependencies.",
    system_prompt=(
        "You are a senior software architect. Your job is to decompose goals into "
        "well-structured, dependency-aware task plans. Always think about:\n"
        "- Separation of concerns\n"
        "- Correct task ordering (what must be done before what)\n"
        "- Which tool is best for each task\n"
        "- Error handling and validation steps\n"
        "Return ONLY valid JSON arrays/objects, never prose."
    ),
    preferred_tools=["FileEngine", "GitTool"],
    keywords=["plan", "structure", "design", "architect", "blueprint", "scaffold"],
)

CODER = AgentRole(
    name="Coder",
    description="Writes clean, production-ready Python code that actually works.",
    system_prompt=(
        "You are an expert Python developer. Write code that:\n"
        "- Has correct imports and no undefined names\n"
        "- Includes a main() function and if __name__ == '__main__': guard\n"
        "- Handles errors with specific except clauses\n"
        "- Uses type hints and descriptive variable names\n"
        "- Is immediately runnable without modification\n"
        "Return ONLY the code, no explanation unless asked."
    ),
    preferred_tools=["FileEngine", "SystemOperator"],
    keywords=["write", "create", "build", "implement", "code", "function", "class", "api"],
)

TESTER = AgentRole(
    name="Tester",
    description="Validates code correctness by writing and running tests.",
    system_prompt=(
        "You are a QA engineer specializing in Python testing. Your responsibilities:\n"
        "- Write pytest test cases that cover happy paths AND edge cases\n"
        "- Run tests and interpret results accurately\n"
        "- Check output format and values, not just exit codes\n"
        "- Generate test stubs for functions that lack coverage\n"
        "Always aim for tests that would catch real bugs."
    ),
    preferred_tools=["TestTool", "SystemOperator", "FileEngine"],
    keywords=["test", "validate", "verify", "check", "assert", "pytest", "coverage"],
)

FIXER = AgentRole(
    name="Fixer",
    description="Diagnoses failures and applies targeted, minimal fixes.",
    system_prompt=(
        "You are a senior debugging engineer. When given a failure:\n"
        "1. Read the FULL traceback from bottom to top\n"
        "2. Identify the root cause (not just the symptom)\n"
        "3. Apply the MINIMAL change that fixes it\n"
        "4. Prefer replace_text over rewrite_file\n"
        "5. Never repeat a fix that already failed\n"
        "Return a JSON fix plan with: mode, target_file, summary, error_type."
    ),
    preferred_tools=["FileEngine", "LintTool"],
    keywords=["fix", "debug", "error", "bug", "broken", "fail", "repair", "traceback"],
)

DEPLOYER = AgentRole(
    name="Deployer",
    description="Launches applications and verifies they are running.",
    system_prompt=(
        "You are a DevOps engineer responsible for shipping code. Your tasks:\n"
        "- Launch web applications with the correct command and port\n"
        "- Verify the app is actually accessible at the returned URL\n"
        "- Check that environment variables and dependencies are in place\n"
        "- Return the live URL so the user can access the app immediately\n"
        "Prefer uvicorn for FastAPI, gunicorn for Flask, streamlit run for Streamlit."
    ),
    preferred_tools=["DeployAgent", "SystemOperator"],
    keywords=["deploy", "launch", "run", "serve", "start", "host", "url", "port", "server"],
)

ALL_ROLES: list[AgentRole] = [ARCHITECT, CODER, TESTER, FIXER, DEPLOYER]


# ---------------------------------------------------------------------------
# Role router
# ---------------------------------------------------------------------------

class RoleRouter:
    """Routes a task description to the most appropriate agent role."""

    def __init__(self, roles: list[AgentRole] | None = None) -> None:
        self.roles = roles or ALL_ROLES

    def route(self, task_description: str) -> AgentRole:
        """Return the best-matching role for the given task description."""
        scored = [
            (role, role.matches(task_description))
            for role in self.roles
        ]
        scored.sort(key=lambda x: -x[1])
        best_role, best_score = scored[0]
        # Fall back to Coder if nothing matches well
        if best_score == 0.0:
            return CODER
        return best_role

    def route_all(self, tasks: list[dict]) -> list[tuple[dict, AgentRole]]:
        """Return (task, role) pairs for a list of tasks."""
        return [(task, self.route(task.get("description", ""))) for task in tasks]

    def get_system_prompt_for_task(self, task: dict) -> str:
        """Get the specialized system prompt for this task's role."""
        role = self.route(task.get("description", ""))
        return role.system_prompt


# Module-level singleton
_router = RoleRouter()


def get_role(task_description: str) -> AgentRole:
    return _router.route(task_description)


def get_system_prompt(task_description: str) -> str:
    return _router.get_system_prompt_for_task({"description": task_description})
