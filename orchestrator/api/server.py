from __future__ import annotations

import contextlib
import io
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from src.orchestrator.core import OrchestratorCore
from src.orchestrator.execution.skills import skill_count, list_skill_names


class _EventStream(io.TextIOBase):
    """Writable stream that emits line-buffered events."""

    def __init__(self, sink: "RunManager", run_id: str, kind: str) -> None:
        self._sink = sink
        self._run_id = run_id
        self._kind = kind
        self._buffer = ""

    def write(self, s: str) -> int:
        if not s:
            return 0
        self._buffer += s
        while "\n" in self._buffer:
            line, self._buffer = self._buffer.split("\n", 1)
            self._sink.add_event(self._run_id, self._kind, line)
        return len(s)

    def flush(self) -> None:
        if self._buffer:
            self._sink.add_event(self._run_id, self._kind, self._buffer)
            self._buffer = ""


@dataclass
class RunState:
    run_id: str
    prompt: str
    provider: str
    status: str = "queued"
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")
    started_at: str | None = None
    finished_at: str | None = None
    error: str | None = None
    events: list[dict[str, Any]] = field(default_factory=list)


class CreateRunRequest(BaseModel):
    prompt: str = Field(min_length=1)
    provider: str = Field(default="mock")


class CreateRunResponse(BaseModel):
    run_id: str
    status: str


class RunStatusResponse(BaseModel):
    run_id: str
    prompt: str
    provider: str
    status: str
    created_at: str
    started_at: str | None = None
    finished_at: str | None = None
    error: str | None = None
    event_count: int
    events: list[dict[str, Any]]


class RunManager:
    def __init__(self) -> None:
        self._runs: dict[str, RunState] = {}
        self._lock = threading.Lock()

    def create_run(self, prompt: str, provider: str) -> RunState:
        run_id = uuid.uuid4().hex
        run = RunState(run_id=run_id, prompt=prompt, provider=provider)
        with self._lock:
            self._runs[run_id] = run
        return run

    def get_run(self, run_id: str) -> RunState | None:
        with self._lock:
            return self._runs.get(run_id)

    def add_event(self, run_id: str, kind: str, message: str) -> None:
        message = message.rstrip("\r")
        if not message:
            return
        with self._lock:
            run = self._runs.get(run_id)
            if not run:
                return
            run.events.append(
                {
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                    "kind": kind,
                    "message": message,
                }
            )

    def _set_status(self, run_id: str, status: str, error: str | None = None) -> None:
        with self._lock:
            run = self._runs.get(run_id)
            if not run:
                return
            run.status = status
            if status == "running" and not run.started_at:
                run.started_at = datetime.utcnow().isoformat() + "Z"
            if status in {"completed", "failed"}:
                run.finished_at = datetime.utcnow().isoformat() + "Z"
            run.error = error

    def start_background(self, run_id: str) -> None:
        thread = threading.Thread(target=self._execute_run, args=(run_id,), daemon=True)
        thread.start()

    def _execute_run(self, run_id: str) -> None:
        run = self.get_run(run_id)
        if not run:
            return

        self._set_status(run_id, "running")
        self.add_event(run_id, "system", "Run started.")

        stream_out = _EventStream(self, run_id, "stdout")
        stream_err = _EventStream(self, run_id, "stderr")

        try:
            with contextlib.redirect_stdout(stream_out), contextlib.redirect_stderr(stream_err):
                core = OrchestratorCore(provider_type=run.provider)
                core.run_prompt(run.prompt)
            stream_out.flush()
            stream_err.flush()
            self.add_event(run_id, "system", "Run completed.")
            self._set_status(run_id, "completed")
        except Exception as exc:  # noqa: BLE001
            stream_out.flush()
            stream_err.flush()
            self.add_event(run_id, "error", f"Unhandled exception: {exc}")
            self._set_status(run_id, "failed", error=str(exc))


app = FastAPI(title="Orchestrator X API", version="1.0.0")
manager = RunManager()


@app.get("/", response_class=HTMLResponse)
def index() -> str:
    n_skills = skill_count()
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Orchestrator X</title>
  <style>
    *, *::before, *::after {{ box-sizing: border-box; }}
    body {{ font-family: 'Segoe UI', Arial, sans-serif; margin: 0; background: #0b0e14; color: #dce3ef; }}
    header {{ background: #111620; border-bottom: 1px solid #1e2840; padding: 14px 28px; display: flex; align-items: center; gap: 18px; }}
    header h1 {{ margin: 0; font-size: 1.2rem; color: #7eb8f7; letter-spacing: .05em; }}
    .badge {{ background: #1a2a40; border: 1px solid #2a3d5a; border-radius: 4px; padding: 2px 10px; font-size: .75rem; color: #8bb8d8; }}
    .main {{ display: grid; grid-template-columns: 1fr 280px; gap: 0; height: calc(100vh - 53px); }}
    .panel {{ padding: 18px 24px; overflow: hidden; display: flex; flex-direction: column; }}
    .row {{ display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; }}
    input[type=text] {{ flex: 1; min-width: 200px; background: #141a26; border: 1px solid #2a3d5a; color: #dce3ef; padding: 9px 12px; border-radius: 5px; font-size: .9rem; }}
    select, button {{ background: #1a2a40; border: 1px solid #2a3d5a; color: #dce3ef; padding: 9px 14px; border-radius: 5px; font-size: .9rem; cursor: pointer; }}
    button:hover {{ background: #22374f; }}
    #start {{ background: #1b4fa8; border-color: #2565c7; color: #fff; font-weight: 600; }}
    #start:hover {{ background: #2565c7; }}
    #meta {{ font-size: .8rem; color: #6888aa; margin-bottom: 4px; min-height: 1.2em; }}
    #skills-hint {{ font-size: .75rem; color: #4a6a88; margin-bottom: 8px; min-height: 1.1em; }}
    #log {{ background: #0d1117; border: 1px solid #1e2840; border-radius: 6px; padding: 14px; flex: 1; overflow: auto; white-space: pre-wrap; font-family: 'Cascadia Code', 'Consolas', monospace; font-size: .82rem; line-height: 1.5; }}
    .stdout  {{ color: #b8d4f7; }}
    .stderr, .error {{ color: #ff8a95; }}
    .system  {{ color: #7ee8a2; }}
    .fail    {{ color: #ff6b6b; font-weight: 600; }}
    .success {{ color: #5df0aa; font-weight: 600; }}
    .info    {{ color: #ffd580; }}
    .start   {{ color: #9fb8d8; font-style: italic; }}
    /* History sidebar */
    #history-panel {{ border-left: 1px solid #1e2840; background: #0e1420; padding: 14px 16px; overflow-y: auto; }}
    #history-panel h3 {{ margin: 0 0 10px; font-size: .85rem; color: #6888aa; text-transform: uppercase; letter-spacing: .06em; }}
    .run-card {{ background: #141a26; border: 1px solid #1e2840; border-radius: 5px; padding: 8px 10px; margin-bottom: 7px; cursor: pointer; font-size: .78rem; transition: border-color .15s; }}
    .run-card:hover {{ border-color: #2a4a6a; }}
    .run-card .rc-prompt {{ color: #c8d8ee; margin-bottom: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }}
    .run-card .rc-meta {{ color: #4a6a88; font-size: .72rem; display: flex; gap: 8px; }}
    .status-completed {{ color: #5df0aa; }}
    .status-failed {{ color: #ff6b6b; }}
    .status-running {{ color: #ffd580; }}
    .status-queued {{ color: #8bb8d8; }}
  </style>
</head>
<body>
  <header>
    <h1>Orchestrator X</h1>
    <span class="badge">Skills: {n_skills}</span>
    <span class="badge">Swarm: parallel</span>
    <span class="badge">Memory: cross-session</span>
  </header>
  <div class="main">
    <div class="panel">
      <div class="row">
        <input type="text" id="prompt" placeholder="Enter a goal — e.g. build a FastAPI CRUD API and run it" />
        <select id="provider">
          <option value="mock">mock</option>
          <option value="auto">auto</option>
          <option value="claude">claude</option>
          <option value="groq">groq</option>
          <option value="ollama">ollama</option>
        </select>
        <button id="start">Run</button>
      </div>
      <div id="skills-hint">Skills preview: type a prompt to see which skills will be injected.</div>
      <div id="meta"></div>
      <div id="log"></div>
    </div>
    <div id="history-panel">
      <h3>Run History</h3>
      <div id="history-list"><span style="color:#3a4a5a;font-size:.78rem">No runs yet.</span></div>
    </div>
  </div>
  <script>
    const startBtn   = document.getElementById("start");
    const promptEl   = document.getElementById("prompt");
    const providerEl = document.getElementById("provider");
    const logEl      = document.getElementById("log");
    const metaEl     = document.getElementById("meta");
    const skillsEl   = document.getElementById("skills-hint");
    let ws = null;
    let previewTimer = null;

    function appendLine(kind, message) {{
      const line = document.createElement("div");
      line.className = kind || "stdout";
      line.textContent = `[${{kind}}] ${{message}}`;
      logEl.appendChild(line);
      logEl.scrollTop = logEl.scrollHeight;
    }}

    // Live skill preview as user types
    promptEl.addEventListener("input", () => {{
      clearTimeout(previewTimer);
      const val = promptEl.value.trim();
      if (!val) {{ skillsEl.textContent = "Skills preview: type a prompt to see which skills will be injected."; return; }}
      previewTimer = setTimeout(async () => {{
        try {{
          const r = await fetch(`/skills/preview?prompt=${{encodeURIComponent(val)}}`);
          const d = await r.json();
          skillsEl.textContent = d.count
            ? `Skills that will be injected (${{d.count}}): ${{d.matched_skills.join(", ")}}`
            : "No matching skills for this prompt (built-in fallback will be used).";
        }} catch (_) {{}}
      }}, 400);
    }});

    startBtn.onclick = async () => {{
      const prompt = promptEl.value.trim();
      if (!prompt) return;
      if (ws) {{ ws.close(); ws = null; }}
      logEl.innerHTML = "";
      metaEl.textContent = "Starting …";
      skillsEl.textContent = "";

      const response = await fetch("/runs", {{
        method: "POST",
        headers: {{ "Content-Type": "application/json" }},
        body: JSON.stringify({{ prompt, provider: providerEl.value }})
      }});

      if (!response.ok) {{ metaEl.textContent = "Failed to create run."; return; }}
      const data = await response.json();
      metaEl.textContent = `run_id=${{data.run_id}}`;

      const scheme = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${{scheme}}://${{location.host}}/runs/${{data.run_id}}/stream`);
      ws.onmessage = (event) => {{
        const payload = JSON.parse(event.data);
        if (payload.type === "event") appendLine(payload.kind, payload.message);
        if (payload.type === "status") {{
          const s = payload.status;
          metaEl.textContent = `run_id=${{data.run_id}} | status=${{s}} | events=${{payload.event_count}}`;
          if (s === "completed") appendLine("success", "Run completed successfully.");
          if (s === "failed") appendLine("fail", `Run failed: ${{payload.error || "unknown error"}}`);
        }}
      }};
      ws.onclose = () => {{ appendLine("system", "Stream closed."); refreshHistory(); }};
      ws.onerror  = () => appendLine("error", "WebSocket error.");
    }};

    // ── History sidebar ──────────────────────────────────────────────────
    const historyEl = document.getElementById("history-list");

    function statusClass(s) {{
      return `status-${{s}}`;
    }}

    async function refreshHistory() {{
      try {{
        const r = await fetch("/runs?limit=20");
        const d = await r.json();
        if (!d.runs || d.runs.length === 0) return;
        historyEl.innerHTML = d.runs.map(run => `
          <div class="run-card" onclick="loadRun('${{run.run_id}}')">
            <div class="rc-prompt">${{run.prompt}}</div>
            <div class="rc-meta">
              <span class="${{statusClass(run.status)}}">${{run.status}}</span>
              <span>${{run.provider}}</span>
              <span>${{run.event_count}} events</span>
            </div>
          </div>`).join("");
      }} catch (_) {{}}
    }}

    async function loadRun(runId) {{
      try {{
        const r = await fetch(`/runs/${{runId}}?limit=500`);
        const d = await r.json();
        logEl.innerHTML = "";
        metaEl.textContent = `run_id=${{d.run_id}} | status=${{d.status}} | ${{d.event_count}} events`;
        d.events.forEach(ev => appendLine(ev.kind, ev.message));
      }} catch (_) {{}}
    }}

    // Poll history every 3 seconds
    refreshHistory();
    setInterval(refreshHistory, 3000);
  </script>
</body>
</html>"""


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "skill_catalog_size": skill_count(),
    }


@app.get("/skills/preview")
def skills_preview(prompt: str = "build python api") -> dict[str, Any]:
    """Preview which skills would be injected for a given prompt."""
    names = list_skill_names(prompt)
    return {"prompt": prompt, "matched_skills": names, "count": len(names)}


@app.get("/runs")
def list_runs(
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    """List all runs, optionally filtered by status (queued|running|completed|failed)."""
    with manager._lock:
        all_runs = list(manager._runs.values())

    if status:
        all_runs = [r for r in all_runs if r.status == status]

    # Sort newest first
    all_runs.sort(key=lambda r: r.created_at, reverse=True)
    page = all_runs[offset: offset + max(1, min(limit, 200))]

    return {
        "total": len(all_runs),
        "offset": offset,
        "limit": limit,
        "runs": [
            {
                "run_id": r.run_id,
                "prompt": r.prompt[:80],
                "provider": r.provider,
                "status": r.status,
                "created_at": r.created_at,
                "started_at": r.started_at,
                "finished_at": r.finished_at,
                "event_count": len(r.events),
                "error": r.error,
            }
            for r in page
        ],
    }


@app.post("/runs", response_model=CreateRunResponse)
def create_run(payload: CreateRunRequest) -> CreateRunResponse:
    run = manager.create_run(payload.prompt, payload.provider)
    manager.start_background(run.run_id)
    return CreateRunResponse(run_id=run.run_id, status=run.status)


@app.get("/runs/{run_id}", response_model=RunStatusResponse)
def get_run(run_id: str, offset: int = 0, limit: int = 200) -> RunStatusResponse:
    run = manager.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    safe_offset = max(0, offset)
    safe_limit = max(1, min(limit, 1000))
    events = run.events[safe_offset : safe_offset + safe_limit]
    return RunStatusResponse(
        run_id=run.run_id,
        prompt=run.prompt,
        provider=run.provider,
        status=run.status,
        created_at=run.created_at,
        started_at=run.started_at,
        finished_at=run.finished_at,
        error=run.error,
        event_count=len(run.events),
        events=events,
    )


@app.websocket("/runs/{run_id}/stream")
async def stream_run(websocket: WebSocket, run_id: str) -> None:
    run = manager.get_run(run_id)
    if not run:
        await websocket.close(code=4404)
        return

    await websocket.accept()
    cursor = 0
    try:
        while True:
            current = manager.get_run(run_id)
            if not current:
                await websocket.send_json({"type": "error", "message": "Run not found"})
                return

            batch = current.events[cursor:]
            for event in batch:
                await websocket.send_json({"type": "event", **event})
            cursor += len(batch)

            await websocket.send_json(
                {
                    "type": "status",
                    "status": current.status,
                    "event_count": len(current.events),
                    "error": current.error,
                }
            )

            if current.status in {"completed", "failed"} and cursor >= len(current.events):
                return

            await time_async_sleep(0.5)
    except WebSocketDisconnect:
        return


async def time_async_sleep(seconds: float) -> None:
    """Small wrapper to avoid importing asyncio throughout."""
    import asyncio

    await asyncio.sleep(seconds)
