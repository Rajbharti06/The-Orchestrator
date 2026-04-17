(() => {
  const API = 'http://localhost:5001';

  // ── DOM refs ─────────────────────────────────────────────────────────────
  const promptEl        = document.getElementById('prompt');
  const llmEl           = document.getElementById('llm');
  const hostingEl       = document.getElementById('hosting');
  const stackEl         = document.getElementById('stack');
  const btnBuild        = document.getElementById('btn-build');
  const btnCancel       = document.getElementById('btn-cancel');
  const btnClearLogs    = document.getElementById('btn-clear-logs');
  const btnRefreshQueue = document.getElementById('btn-refresh-queue');
  const statusBadge     = document.getElementById('status-badge');
  const providersLabel  = document.getElementById('providers-label');
  const progressWrap    = document.getElementById('progress-bar-wrap');
  const progressBar     = document.getElementById('progress-bar');
  const progressLabel   = document.getElementById('progress-label');
  const logOutput       = document.getElementById('log-output');
  const filesList       = document.getElementById('files-list');
  const filesCount      = document.getElementById('files-count');
  const historyList     = document.getElementById('history-list');
  const reactTimeline   = document.getElementById('react-timeline');
  const queueStats      = document.getElementById('queue-stats');
  const queueList       = document.getElementById('queue-list');

  const stages = document.querySelectorAll('.stage');

  // ── State ─────────────────────────────────────────────────────────────────
  let currentPhase = 'idle';
  const completedPhases = new Set();
  let es = null;

  const PHASE_ORDER = ['planning', 'architect', 'backend', 'ui', 'qa', 'fix', 'test', 'deploy', 'done'];

  // ── Helpers ───────────────────────────────────────────────────────────────
  function ts() {
    return new Date().toLocaleTimeString('en-GB', { hour12: false });
  }

  function appendLog(msg, cls = 'log-info') {
    const line = document.createElement('div');
    line.className = `log-line ${cls}`;
    line.innerHTML = `<span class="log-ts">${ts()}</span>${escapeHtml(msg)}`;
    logOutput.appendChild(line);
    logOutput.scrollTop = logOutput.scrollHeight;
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function setBadge(status) {
    statusBadge.className = `badge badge-${status}`;
    statusBadge.textContent = status.toUpperCase();
  }

  function setProgress(pct) {
    progressBar.style.width = pct + '%';
    progressLabel.textContent = pct + '%';
  }

  function setPhase(phase) {
    if (phase === 'idle') {
      stages.forEach(s => { s.classList.remove('active', 'done', 'failed'); });
      currentPhase = 'idle';
      completedPhases.clear();
      return;
    }
    const idx = PHASE_ORDER.indexOf(phase);
    stages.forEach(s => {
      const p = s.dataset.phase;
      const pi = PHASE_ORDER.indexOf(p);
      s.classList.remove('active', 'done', 'failed');
      if (pi < idx) { s.classList.add('done'); completedPhases.add(p); }
      else if (p === phase) s.classList.add('active');
    });
    currentPhase = phase;
    appendLog(`Phase: ${phase.toUpperCase()}`, 'log-phase');
  }

  function markAllDone() {
    stages.forEach(s => { s.classList.remove('active', 'failed'); s.classList.add('done'); });
  }

  function markFailed() {
    stages.forEach(s => {
      if (s.classList.contains('active')) {
        s.classList.remove('active'); s.classList.add('failed');
      }
    });
  }

  // ── ReAct Timeline ────────────────────────────────────────────────────────
  const REACT_ICONS = { thought: '💭', action: '▶', observation: '👁' };
  const REACT_CLS   = { thought: 'react-thought', action: 'react-action', observation: 'react-obs' };

  function appendReact(event) {
    if (!reactTimeline) return;
    const { type, content } = event;
    const item = document.createElement('div');
    item.className = `react-item ${REACT_CLS[type] || ''}`;
    item.innerHTML = `
      <span class="react-icon">${REACT_ICONS[type] || '?'}</span>
      <span class="react-type">${escapeHtml(type)}</span>
      <span class="react-content">${escapeHtml(content || '')}</span>
    `;
    reactTimeline.appendChild(item);
    reactTimeline.scrollTop = reactTimeline.scrollHeight;
  }

  function clearReactTimeline() {
    if (reactTimeline) reactTimeline.innerHTML = '';
  }

  function renderFiles(files) {
    filesList.innerHTML = '';
    filesCount.textContent = files.length;
    for (const f of files) {
      const li = document.createElement('li');
      const ext = (f.match(/\.(\w+)$/) || ['', ''])[1];
      li.innerHTML = `<span class="file-ext-${ext}">${escapeHtml(f)}</span>`;
      filesList.appendChild(li);
    }
  }

  function renderHistory(history) {
    historyList.innerHTML = '';
    for (const h of history.slice(0, 10)) {
      const status = h.status;
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="history-prompt" title="${escapeHtml(h.prompt || '')}">${escapeHtml((h.prompt || '').substring(0, 50))}...</span>
        <span class="badge badge-${status} history-status">${status}</span>`;
      historyList.appendChild(li);
    }
  }

  // ── Job Queue ─────────────────────────────────────────────────────────────
  function renderQueue(data) {
    const { status, jobs } = data;
    if (queueStats) {
      queueStats.textContent = `Pending: ${status.pending}  Running: ${status.running}  Done: ${status.done}  Failed: ${status.failed}`;
    }
    if (!queueList) return;
    queueList.innerHTML = '';
    for (const j of (jobs || []).slice(0, 15)) {
      const li = document.createElement('li');
      li.className = 'queue-item';
      li.innerHTML = `
        <span class="queue-prompt">${escapeHtml((j.prompt || '').substring(0, 45))}…</span>
        <span class="badge badge-${j.status}">${j.status}</span>
        ${j.status === 'queued' ? `<button class="btn btn-ghost btn-xs cancel-job" data-id="${j.id}">✕</button>` : ''}
      `;
      queueList.appendChild(li);
    }
    // Cancel buttons
    queueList.querySelectorAll('.cancel-job').forEach(btn => {
      btn.addEventListener('click', async () => {
        await fetch(`${API}/queue/${btn.dataset.id}`, { method: 'DELETE' });
        loadQueue();
      });
    });
  }

  async function loadQueue() {
    try {
      const r = await fetch(`${API}/queue`);
      renderQueue(await r.json());
    } catch (_) {}
  }

  function applyState(state) {
    setBadge(state.status);
    setProgress(state.progress || 0);
    if (state.files && state.files.length) renderFiles(state.files);
    const running = state.status === 'running';
    btnBuild.disabled = running;
    btnCancel.disabled = !running;
    progressWrap.classList.toggle('hidden', state.status === 'idle');
    if (state.phase) setPhase(state.phase);
    if (state.status === 'done') markAllDone();
    if (state.status === 'failed') markFailed();
  }

  // ── SSE connection ────────────────────────────────────────────────────────
  function connectSSE() {
    if (es) es.close();
    es = new EventSource(`${API}/logs`);

    es.onmessage = e => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'log') {
          const cls = /error|fail/i.test(data.msg) ? 'log-error'
                    : /warn|issue/i.test(data.msg) ? 'log-warn'
                    : /pass|success|done|ok/i.test(data.msg) ? 'log-ok'
                    : 'log-info';
          appendLog(data.msg, cls);
        } else if (data.type === 'phase') {
          setPhase(data.phase);
          setProgress(data.progress || 0);
        } else if (data.type === 'state') {
          applyState(data.state);
        } else if (data.type === 'react') {
          appendReact(data.event);
        }
      } catch (_) {}
    };

    es.onerror = () => {
      appendLog('[SSE disconnected — reconnecting in 3s...]', 'log-warn');
      es.close();
      setTimeout(connectSSE, 3000);
    };
  }

  // ── Fetch providers ───────────────────────────────────────────────────────
  async function loadProviders() {
    try {
      const r = await fetch(`${API}/providers`);
      const d = await r.json();
      const active = d.active || [];
      providersLabel.textContent = active.length
        ? `providers: ${active.join(' · ')}`
        : 'no providers configured';
    } catch (_) {
      providersLabel.textContent = 'server offline';
    }
  }

  async function loadStatus() {
    try {
      const r = await fetch(`${API}/status`);
      applyState(await r.json());
    } catch (_) {}
  }

  async function loadHistory() {
    try {
      const r = await fetch(`${API}/history`);
      renderHistory(await r.json());
    } catch (_) {}
  }

  // ── Build ─────────────────────────────────────────────────────────────────
  btnBuild.addEventListener('click', async () => {
    const prompt = promptEl.value.trim();
    if (!prompt) { appendLog('Please enter a prompt.', 'log-warn'); return; }

    clearReactTimeline();
    appendLog(`Starting build: "${prompt.substring(0, 80)}..."`, 'log-phase');
    setPhase('planning');
    setBadge('running');
    progressWrap.classList.remove('hidden');
    setProgress(5);
    btnBuild.disabled = true;
    btnCancel.disabled = false;

    try {
      const res = await fetch(`${API}/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          llm: llmEl.value,
          hosting: hostingEl.value,
          stack: stackEl.value || undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        appendLog(`Error: ${d.error}`, 'log-error');
        setBadge('failed');
        btnBuild.disabled = false;
        btnCancel.disabled = true;
      }
    } catch (err) {
      appendLog(`Network error: ${err.message}`, 'log-error');
      setBadge('failed');
      btnBuild.disabled = false;
      btnCancel.disabled = true;
    }
  });

  // ── Cancel ────────────────────────────────────────────────────────────────
  btnCancel.addEventListener('click', async () => {
    try {
      await fetch(`${API}/cancel`, { method: 'POST' });
      appendLog('Cancellation requested.', 'log-warn');
    } catch (err) {
      appendLog(`Cancel error: ${err.message}`, 'log-error');
    }
    btnCancel.disabled = true;
    btnBuild.disabled = false;
  });

  // ── Queue refresh ─────────────────────────────────────────────────────────
  if (btnRefreshQueue) btnRefreshQueue.addEventListener('click', loadQueue);

  // ── Clear logs ────────────────────────────────────────────────────────────
  btnClearLogs.addEventListener('click', () => { logOutput.innerHTML = ''; });

  // ── Autonomous Mode ───────────────────────────────────────────────────────
  const btnAutoStart       = document.getElementById('btn-auto-start');
  const btnAutoStop        = document.getElementById('btn-auto-stop');
  const btnRunEval         = document.getElementById('btn-run-eval');
  const autoBadge          = document.getElementById('auto-badge');
  const autoScore          = document.getElementById('auto-score');
  const autoTrend          = document.getElementById('auto-trend');
  const autoWeakAreas      = document.getElementById('auto-weak-areas');
  const btnRefreshInsights = document.getElementById('btn-refresh-insights');
  const insScore           = document.getElementById('ins-score');
  const insTrend           = document.getElementById('ins-trend');
  const insLessons         = document.getElementById('ins-lessons');
  const insSuccesses       = document.getElementById('ins-successes');
  const insWeakAreas       = document.getElementById('ins-weak-areas');

  function setAutoBadge(status) {
    if (!autoBadge) return;
    autoBadge.className = `badge badge-${status === 'running' ? 'running' : status === 'stopped' ? 'idle' : 'idle'}`;
    autoBadge.textContent = status.toUpperCase();
  }

  async function loadAutoStatus() {
    try {
      const r = await fetch(`${API}/autonomous/status`);
      const d = await r.json();
      setAutoBadge(d.running ? 'running' : d.status || 'idle');
      if (btnAutoStart) btnAutoStart.disabled = !!d.running;
      if (btnAutoStop)  btnAutoStop.disabled  = !d.running;

      // Show latest score
      if (d.lastScore !== null && d.lastScore !== undefined && autoScore) {
        autoScore.textContent = `Score: ${d.lastScore}%`;
      }

      // Show insights from state
      const insight = (d.insights || [])[0];
      if (insight && autoTrend) {
        autoTrend.textContent = `Trend: ${insight.trend || '—'}`;
      }

      // Weak areas
      const latest = (d.insights || [])[0];
      if (latest?.weakAreas?.length && autoWeakAreas) {
        autoWeakAreas.innerHTML = `<span class="weak-label">Weak:</span> ${latest.weakAreas.map(w => `<span class="weak-tag">${escapeHtml(w)}</span>`).join(' ')}`;
      }
    } catch (_) {}
  }

  async function loadInsights() {
    try {
      const r = await fetch(`${API}/insights`);
      const d = await r.json();
      if (insScore)     insScore.textContent     = d.eval?.latest ? `${d.eval.latest.score}% (${d.eval.latest.passed}/${d.eval.latest.total})` : '—';
      if (insTrend)     insTrend.textContent     = d.eval?.trend?.trend || '—';
      if (insLessons)   insLessons.textContent   = d.learning?.lessons ?? '—';
      if (insSuccesses) insSuccesses.textContent = d.learning?.successes?.total ?? '—';
      if (insWeakAreas && d.eval?.weakAreas?.length) {
        insWeakAreas.innerHTML = d.eval.weakAreas.slice(0, 3).map(w =>
          `<div class="weak-area-row">⚠ <b>${escapeHtml(w.name)}</b> — failed ${w.failCount}x</div>`
        ).join('');
      }
    } catch (_) {}
  }

  if (btnAutoStart) {
    btnAutoStart.addEventListener('click', async () => {
      btnAutoStart.disabled = true;
      appendLog('Starting autonomous loop...', 'log-phase');
      try {
        const r = await fetch(`${API}/autonomous/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
        const d = await r.json();
        if (d.alreadyRunning) { appendLog('Already running.', 'log-warn'); }
        else { appendLog('Autonomous loop started.', 'log-ok'); setAutoBadge('running'); btnAutoStop.disabled = false; }
      } catch (err) { appendLog(`Error: ${err.message}`, 'log-error'); btnAutoStart.disabled = false; }
    });
  }

  if (btnAutoStop) {
    btnAutoStop.addEventListener('click', async () => {
      btnAutoStop.disabled = true;
      appendLog('Stopping autonomous loop...', 'log-warn');
      try {
        await fetch(`${API}/autonomous/stop`, { method: 'POST' });
        appendLog('Autonomous loop stopped.', 'log-ok');
        setAutoBadge('idle');
        btnAutoStart.disabled = false;
      } catch (err) { appendLog(`Error: ${err.message}`, 'log-error'); }
    });
  }

  if (btnRunEval) {
    btnRunEval.addEventListener('click', async () => {
      btnRunEval.disabled = true;
      appendLog('Running eval suite...', 'log-phase');
      try {
        await fetch(`${API}/eval`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
        appendLog('Eval started — watch logs for results.', 'log-info');
        setTimeout(() => { btnRunEval.disabled = false; loadInsights(); }, 3000);
      } catch (err) { appendLog(`Eval error: ${err.message}`, 'log-error'); btnRunEval.disabled = false; }
    });
  }

  if (btnRefreshInsights) btnRefreshInsights.addEventListener('click', loadInsights);

  // Handle autonomous SSE events
  const _origOnMessage = es?.onmessage;
  function patchSSE() {
    if (!es) return;
    const orig = es.onmessage;
    es.onmessage = e => {
      if (orig) orig(e);
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'autonomous') {
          const { event, data: d } = data;
          if (event === 'cycle_complete') {
            appendLog(`🤖 Cycle done — score: ${d?.score}% trend: ${d?.trend}`, 'log-ok');
            loadAutoStatus(); loadInsights();
          } else if (event === 'improvement') {
            appendLog(`📈 Score improved: ${d?.from}% → ${d?.to}%`, 'log-ok');
          } else if (event === 'perfect_score') {
            appendLog(`🏆 Perfect score achieved! All eval tests passing.`, 'log-ok');
          }
        } else if (data.type === 'eval_complete') {
          appendLog(`🧪 Eval: ${data.result?.score}% (${data.result?.passed}/${data.result?.total})`, 'log-ok');
          loadInsights(); loadAutoStatus();
        }
      } catch (_) {}
    };
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  connectSSE();
  setTimeout(patchSSE, 500); // patch after SSE connects
  loadProviders();
  loadStatus();
  loadHistory();
  loadQueue();
  loadAutoStatus();
  loadInsights();
  setInterval(loadHistory, 15000);
  setInterval(loadQueue, 10000);
  setInterval(loadAutoStatus, 15000);
  setInterval(loadInsights, 30000);
})();
