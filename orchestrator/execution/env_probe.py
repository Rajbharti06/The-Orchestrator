from __future__ import annotations

"""
EnvironmentProbe - captures the runtime environment once at startup and
makes it available for injection into every LLM system prompt.

This tells the LLM exactly what it's working with so it stops guessing:
  * Python version
  * OS / platform
  * Installed packages (no more "pip install X" suggestions for already-installed libs)
  * Workspace file tree (understands what already exists)
  * Available CLI tools (python, git, node, etc.)
"""

import importlib.util
import os
import platform
import subprocess
import sys
from pathlib import Path


_SKIP_DIRS = frozenset({
    ".git", "__pycache__", ".venv", "venv", "env", "node_modules",
    ".idea", ".vscode", "dist", "build", ".pytest_cache",
})


class EnvironmentProbe:
    """Singleton-style environment snapshot captured once per session."""

    _cache: dict | None = None

    @classmethod
    def capture(cls, force: bool = False) -> dict:
        if cls._cache is not None and not force:
            return cls._cache

        snapshot = {
            "python_version": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
            "python_executable": sys.executable,
            "platform": platform.system(),
            "platform_detail": platform.platform(),
            "cwd": os.getcwd(),
            "installed_packages": cls._get_installed_packages(),
            "cli_tools": cls._check_cli_tools(),
            "workspace_files": cls._get_workspace_files(),
        }
        cls._cache = snapshot
        return snapshot

    # ---------------------------------------------------------------- probes

    @staticmethod
    def _get_installed_packages() -> dict[str, str]:
        """Return {package_name: version} for all pip-installed packages."""
        try:
            result = subprocess.run(
                [sys.executable, "-m", "pip", "list", "--format=freeze"],
                capture_output=True, text=True, timeout=20,
            )
            packages: dict[str, str] = {}
            for line in result.stdout.strip().splitlines():
                if "==" in line:
                    name, ver = line.split("==", 1)
                    packages[name.lower()] = ver
            return packages
        except Exception:
            return {}

    @staticmethod
    def _check_cli_tools() -> dict[str, bool]:
        """Check which common CLI tools are available on PATH."""
        tools = ["git", "node", "npm", "docker", "curl", "make"]
        availability: dict[str, bool] = {}
        for tool in tools:
            try:
                subprocess.run(
                    [tool, "--version"],
                    capture_output=True, timeout=3,
                )
                availability[tool] = True
            except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
                availability[tool] = False
        return availability

    @staticmethod
    def _get_workspace_files(max_depth: int = 3, max_files: int = 60) -> list[str]:
        """Return relative paths of workspace files up to max_depth."""
        cwd = Path(os.getcwd())
        results: list[str] = []

        def _walk(directory: Path, depth: int) -> None:
            if depth > max_depth or len(results) >= max_files:
                return
            try:
                for entry in sorted(directory.iterdir()):
                    if entry.name in _SKIP_DIRS or entry.name.startswith("."):
                        continue
                    rel = str(entry.relative_to(cwd))
                    results.append(rel)
                    if entry.is_dir():
                        _walk(entry, depth + 1)
            except PermissionError:
                pass

        _walk(cwd, 0)
        return results[:max_files]

    # ---------------------------------------------------------------- helpers

    @classmethod
    def is_installed(cls, package: str) -> bool:
        """Fast check: is this package importable right now?"""
        return importlib.util.find_spec(package) is not None

    @classmethod
    def package_version(cls, package: str) -> str | None:
        snapshot = cls.capture()
        return snapshot["installed_packages"].get(package.lower())

    @classmethod
    def format_for_llm(cls, snapshot: dict | None = None) -> str:
        """
        Compact multi-line string injected into LLM system prompts.
        Tells the model exactly what environment it's operating in.
        """
        if snapshot is None:
            snapshot = cls.capture()

        pkgs = snapshot.get("installed_packages", {})
        # Only list the most relevant packages to avoid prompt bloat
        _KEY_PACKAGES = {
            "anthropic", "openai", "groq", "fastapi", "flask", "uvicorn",
            "requests", "httpx", "pydantic", "sqlalchemy", "pandas",
            "numpy", "streamlit", "langchain", "pytest", "aiohttp",
        }
        listed = [
            f"{n}=={v}" for n, v in pkgs.items()
            if n in _KEY_PACKAGES
        ]

        tools = snapshot.get("cli_tools", {})
        available_tools = [t for t, ok in tools.items() if ok]

        files = snapshot.get("workspace_files", [])
        py_files = [f for f in files if f.endswith(".py")][:15]

        lines = [
            f"Python {snapshot.get('python_version', '?')} on {snapshot.get('platform', '?')}",
            f"CWD: {snapshot.get('cwd', '.')}",
        ]
        if listed:
            lines.append(f"Key packages installed: {', '.join(sorted(listed))}")
        if available_tools:
            lines.append(f"CLI tools available: {', '.join(available_tools)}")
        if py_files:
            lines.append(f"Python files in workspace: {', '.join(py_files)}")

        return "\n".join(lines)
