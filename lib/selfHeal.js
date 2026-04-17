/**
 * Self-Heal Service
 *
 * Each internal subsystem registers a health-check function and a repair function.
 * Before every build the system runs all checks. Unhealthy subsystems are repaired
 * automatically. If repair fails after N attempts the subsystem is marked escalated
 * and the incident is logged to memory/heal_log.json.
 *
 * Subsystems monitored: llmRouter, memoryStore, skillsCatalog, outputDir
 */

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

const MAX_REPAIR_ATTEMPTS = 3;
const HEAL_LOG_FILE = path.join(process.cwd(), 'memory', 'heal_log.json');

// ── Health state machine ──────────────────────────────────────────────────────
// States: 'healthy' | 'degraded' | 'failed' | 'healing' | 'escalated'
const subsystems = new Map();
const healEmitter = new EventEmitter();

function registerSubsystem(name, { check, repair, critical = false }) {
  subsystems.set(name, {
    name,
    check,
    repair,
    critical,
    state: 'healthy',
    repairAttempts: 0,
    lastCheck: null,
    lastError: null,
    lastRepair: null,
  });
}

// ── Log ───────────────────────────────────────────────────────────────────────
function appendHealLog(entry) {
  try {
    const dir = path.dirname(HEAL_LOG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    let log = [];
    try { log = JSON.parse(fs.readFileSync(HEAL_LOG_FILE, 'utf8')); } catch {}
    log.push({ ...entry, ts: Date.now() });
    if (log.length > 200) log = log.slice(-200);
    fs.writeFileSync(HEAL_LOG_FILE, JSON.stringify(log, null, 2));
  } catch {}
}

// ── Core heal loop ────────────────────────────────────────────────────────────
async function checkSubsystem(name) {
  const sub = subsystems.get(name);
  if (!sub) return null;

  sub.lastCheck = Date.now();
  let healthy = false;

  try {
    healthy = await sub.check();
  } catch (err) {
    sub.lastError = err.message;
    healthy = false;
  }

  if (healthy) {
    if (sub.state !== 'healthy') {
      sub.state = 'healthy';
      sub.repairAttempts = 0;
      healEmitter.emit('recovered', { name });
      appendHealLog({ event: 'recovered', subsystem: name });
    }
    return 'healthy';
  }

  // Unhealthy — attempt repair
  if (sub.repairAttempts >= MAX_REPAIR_ATTEMPTS) {
    sub.state = 'escalated';
    healEmitter.emit('escalated', { name, error: sub.lastError });
    appendHealLog({ event: 'escalated', subsystem: name, error: sub.lastError });
    return 'escalated';
  }

  sub.state = 'healing';
  sub.repairAttempts += 1;
  healEmitter.emit('healing', { name, attempt: sub.repairAttempts });

  try {
    await sub.repair();
    sub.lastRepair = Date.now();
    // Re-check after repair
    const recheck = await sub.check().catch(() => false);
    if (recheck) {
      sub.state = 'healthy';
      sub.repairAttempts = 0;
      appendHealLog({ event: 'repaired', subsystem: name, attempt: sub.repairAttempts });
      healEmitter.emit('repaired', { name });
      return 'healthy';
    }
    sub.state = 'degraded';
    appendHealLog({ event: 'repair_failed', subsystem: name, attempt: sub.repairAttempts });
    return 'degraded';
  } catch (err) {
    sub.state = 'failed';
    sub.lastError = err.message;
    appendHealLog({ event: 'repair_error', subsystem: name, error: err.message });
    return 'failed';
  }
}

async function runHealthCheck() {
  const results = {};
  for (const [name] of subsystems) {
    results[name] = await checkSubsystem(name);
  }
  return results;
}

function getSubsystemState(name) {
  const sub = subsystems.get(name);
  if (!sub) return null;
  return {
    name: sub.name,
    state: sub.state,
    repairAttempts: sub.repairAttempts,
    lastCheck: sub.lastCheck,
    lastError: sub.lastError,
    lastRepair: sub.lastRepair,
  };
}

function getAllStates() {
  const out = {};
  for (const [name, sub] of subsystems) {
    out[name] = {
      state: sub.state,
      repairAttempts: sub.repairAttempts,
      lastError: sub.lastError,
    };
  }
  return out;
}

// ── Built-in subsystem registrations ─────────────────────────────────────────
function initDefaultSubsystems() {
  // Memory store health
  registerSubsystem('memoryStore', {
    critical: false,
    check: () => {
      const memDir = path.join(process.cwd(), 'memory');
      return fs.existsSync(memDir);
    },
    repair: () => {
      const memDir = path.join(process.cwd(), 'memory');
      fs.mkdirSync(memDir, { recursive: true });
    },
  });

  // Skills catalog health
  registerSubsystem('skillsCatalog', {
    critical: false,
    check: () => {
      const f = path.join(process.cwd(), 'lib', 'skillsCatalog.json');
      if (!fs.existsSync(f)) return false;
      const data = JSON.parse(fs.readFileSync(f, 'utf8'));
      return Array.isArray(data.skills) && data.skills.length > 0;
    },
    repair: () => {
      // Write minimal catalog as fallback
      const f = path.join(process.cwd(), 'lib', 'skillsCatalog.json');
      if (!fs.existsSync(f)) {
        fs.writeFileSync(f, JSON.stringify({ skills: [] }, null, 2));
      }
    },
  });

  // Output directory health
  registerSubsystem('outputDir', {
    critical: false,
    check: () => {
      const outDir = process.env.OUTPUT_DIR || process.cwd();
      return fs.existsSync(outDir) && fs.statSync(outDir).isDirectory();
    },
    repair: () => {
      const outDir = process.env.OUTPUT_DIR;
      if (outDir) fs.mkdirSync(outDir, { recursive: true });
    },
  });

  // LLM router health (checks at least one provider key exists)
  registerSubsystem('llmRouter', {
    critical: true,
    check: () => {
      const keys = [
        process.env.XAI_API_KEY,
        process.env.GROQ_API_KEY,
        process.env.OPENAI_API_KEY,
        process.env.ANTHROPIC_API_KEY,
        process.env.MISTRAL_API_KEY,
        process.env.OPENROUTER_API_KEY,
        process.env.GEMINI_API_KEY,
        process.env.DEEPSEEK_API_KEY,
        process.env.OLLAMA_BASE_URL,
      ];
      return keys.some(k => k && k.trim() !== '');
    },
    repair: () => {
      // Try to load .env if it exists
      const envFile = path.join(process.cwd(), '.env');
      if (fs.existsSync(envFile)) {
        const lines = fs.readFileSync(envFile, 'utf8').split('\n');
        for (const line of lines) {
          const m = line.match(/^([A-Z_]+)=(.+)$/);
          if (m && !process.env[m[1]]) {
            process.env[m[1]] = m[2].trim();
          }
        }
      }
    },
  });
}

module.exports = {
  registerSubsystem,
  checkSubsystem,
  runHealthCheck,
  getSubsystemState,
  getAllStates,
  initDefaultSubsystems,
  healEmitter,
};
