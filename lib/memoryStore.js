const fs = require('fs');
const path = require('path');

const memDir = path.join(process.cwd(), 'memory');
const memFile = path.join(memDir, 'memory.json');

function ensure() {
  if (!fs.existsSync(memDir)) fs.mkdirSync(memDir, { recursive: true });
  if (!fs.existsSync(memFile)) fs.writeFileSync(memFile, JSON.stringify({ prompts: [], runs: [], issues: [], preferences: {} }, null, 2));
}

function load() {
  ensure();
  try {
    return JSON.parse(fs.readFileSync(memFile, 'utf8'));
  } catch {
    return { prompts: [], runs: [], issues: [], preferences: {} };
  }
}

function save(data) {
  ensure();
  fs.writeFileSync(memFile, JSON.stringify(data, null, 2));
}

function recordPrompt(prompt) {
  const m = load();
  m.prompts.push({ prompt, ts: Date.now() });
  save(m);
}

function recordIssues(issues) {
  const m = load();
  m.issues.push({ issues, ts: Date.now() });
  save(m);
}

function recordRun(summary) {
  const m = load();
  m.runs.push({ summary, ts: Date.now() });
  save(m);
}

function summary() {
  const m = load();
  const lastIssues = m.issues.slice(-3);
  const prefs = m.preferences || {};
  return { lastIssues, preferences: prefs };
}

function setPreference(key, value) {
  const m = load();
  m.preferences = m.preferences || {};
  m.preferences[key] = value;
  save(m);
}

function getPreference(key, fallback) {
  const m = load();
  return (m.preferences && key in m.preferences) ? m.preferences[key] : fallback;
}

module.exports = { load, save, recordPrompt, recordIssues, recordRun, summary, setPreference, getPreference };
