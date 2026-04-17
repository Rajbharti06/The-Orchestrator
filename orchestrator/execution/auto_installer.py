from __future__ import annotations

"""
AutoInstaller - detects missing Python imports in a script and installs
them with pip before execution, so the agent never fails on a missing
dependency it could have installed itself.

Flow:
  1. Parse imports from the target file (via ImportValidator)
  2. Cross-reference against the current environment snapshot
  3. Run `pip install <pkg>` for anything missing
  4. Return a report of what was installed / what failed
"""

import importlib.util
import subprocess
import sys
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from .validators import ImportValidator

if TYPE_CHECKING:
    from .env_probe import EnvironmentProbe


# Common import name -> PyPI package name mappings (import name != pip name)
_IMPORT_TO_PIP: dict[str, str] = {
    "cv2": "opencv-python",
    "PIL": "Pillow",
    "sklearn": "scikit-learn",
    "bs4": "beautifulsoup4",
    "yaml": "pyyaml",
    "dotenv": "python-dotenv",
    "dateutil": "python-dateutil",
    "jose": "python-jose",
    "magic": "python-magic",
    "attr": "attrs",
    "google.cloud": "google-cloud-core",
    "google.generativeai": "google-generativeai",
    "anthropic": "anthropic",
    "groq": "groq",
    "openai": "openai",
    "fastapi": "fastapi",
    "uvicorn": "uvicorn",
    "pydantic": "pydantic",
    "httpx": "httpx",
    "requests": "requests",
    "aiohttp": "aiohttp",
    "streamlit": "streamlit",
    "flask": "Flask",
    "django": "Django",
    "sqlalchemy": "SQLAlchemy",
    "pandas": "pandas",
    "numpy": "numpy",
}


@dataclass
class InstallReport:
    installed: list[str] = field(default_factory=list)
    failed: list[str] = field(default_factory=list)
    already_present: list[str] = field(default_factory=list)

    @property
    def all_ok(self) -> bool:
        return len(self.failed) == 0

    def summary(self) -> str:
        parts: list[str] = []
        if self.installed:
            parts.append(f"Installed: {', '.join(self.installed)}")
        if self.already_present:
            parts.append(f"Already present: {', '.join(self.already_present)}")
        if self.failed:
            parts.append(f"Failed to install: {', '.join(self.failed)}")
        return " | ".join(parts) if parts else "Nothing to install."


class AutoInstaller:
    """
    Scans a Python file for third-party imports and pip-installs any
    that are missing from the current environment.
    """

    def __init__(self, known_packages: dict[str, str] | None = None):
        """
        known_packages: dict of {pip_name_lower: version} from EnvironmentProbe.
        If None, falls back to importlib.util.find_spec() checks.
        """
        self._known: dict[str, str] = {
            k.lower(): v for k, v in (known_packages or {}).items()
        }

    def check_and_install(self, file_path: str) -> InstallReport:
        """
        Main entry point: check imports in file_path, install missing ones.
        Returns an InstallReport.
        """
        report = InstallReport()
        third_party = ImportValidator.find_third_party(file_path)

        for import_name in third_party:
            pip_name = _IMPORT_TO_PIP.get(import_name, import_name)
            pip_key = pip_name.lower()

            # 1. Check environment snapshot
            if self._known and pip_key in self._known:
                report.already_present.append(pip_name)
                continue

            # 2. Check importlib (runtime truth)
            if importlib.util.find_spec(import_name) is not None:
                report.already_present.append(pip_name)
                continue

            # 3. Try to install
            ok = self._pip_install(pip_name)
            if ok:
                report.installed.append(pip_name)
                # Update local cache so we don't try again
                self._known[pip_key] = "auto-installed"
            else:
                report.failed.append(pip_name)

        return report

    @staticmethod
    def _pip_install(package: str) -> bool:
        print(f"[AutoInstaller] pip install {package} ...")
        try:
            result = subprocess.run(
                [sys.executable, "-m", "pip", "install", package,
                 "--quiet", "--disable-pip-version-check"],
                capture_output=True,
                text=True,
                timeout=90,
            )
            if result.returncode == 0:
                print(f"[AutoInstaller] Installed {package}.")
                return True
            else:
                err = (result.stderr or result.stdout)[:300]
                print(f"[AutoInstaller] Failed to install {package}: {err}")
                return False
        except subprocess.TimeoutExpired:
            print(f"[AutoInstaller] Timeout installing {package}.")
            return False
        except Exception as e:
            print(f"[AutoInstaller] Exception installing {package}: {e}")
            return False
