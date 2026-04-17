const fs = require('fs');
const path = require('path');

const memDir = path.join(process.cwd(), 'memory');
const memFile = path.join(memDir, 'memory.json');

const MAX_PROMPTS = 50;
const MAX_RUNS = 20;
const MAX_ISSUES = 30;

function ensure() {
  if (!fs.existsSync(memDir)) fs.mkdirSync(memDir, { recursive: true });
  if (!fs.existsSync(memFile)) {
    fs.writeFileSync(memFile, JSON.stringify({
      prompts: [], runs: [], issues: [], preferences: {}, lastRun: null,
    }, null, 2));
  }
}

function load() {
  ensure();
  try {
    return JSON.parse(fs.readFileSync(memFile, 'utf8'));
  } catch {
    return { prompts: [], runs: [], issues: [], preferences: {}, lastRun: null };
  }
}

function save(data) {
  ensure();
  // Trim old entries to prevent unbounded growth
  if (data.prompts && data.prompts.length > MAX_PROMPTS)
    data.prompts = data.prompts.slice(-MAX_PROMPTS);
  if (data.runs && data.runs.length > MAX_RUNS)
    data.runs = data.runs.slice(-MAX_RUNS);
  if (data.issues && data.issues.length > MAX_ISSUES)
    data.issues = data.issues.slice(-MAX_ISSUES);
  fs.writeFileSync(memFile, JSON.stringify(data, null, 2));
}

function recordPrompt(prompt) {
  const m = load();
  m.prompts.push({ prompt, ts: Date.now() });
  save(m);
}

function recordIssues(issues) {
  if (!issues || !issues.length) return;
  const m = load();
  m.issues.push({ issues, ts: Date.now() });
  save(m);
}

function recordRun(summary) {
  const m = load();
  m.runs.push({ summary, ts: Date.now() });
  m.lastRun = { summary, ts: Date.now() };
  save(m);
}

function summary() {
  const m = load();
  // Return last 5 issue batches (not just 3) for better memory
  const lastIssues = (m.issues || []).slice(-5);
  const prefs = m.preferences || {};
  const lastRun = m.lastRun || null;
  return { lastIssues, preferences: prefs, lastRun };
}

function setPreference(key, value) {
  const m = load();
  m.preferences = m.preferences || {};
  m.preferences[key] = value;
  save(m);
}

function getPreference(key, fallback) {
  const m = load();
  return m.preferences && key in m.preferences ? m.preferences[key] : fallback;
}

function clearHistory() {
  save({ prompts: [], runs: [], issues: [], preferences: load().preferences || {}, lastRun: null });
}

module.exports = { load, save, recordPrompt, recordIssues, recordRun, summary, setPreference, getPreference, clearHistory };
