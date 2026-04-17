/**
 * Job Queue — Non-Blocking Build Queue
 *
 * Accepts build requests without blocking the API response.
 * Processes one job at a time in FIFO order; additional jobs wait in line.
 * Each job tracks: id, prompt, options, status, result, error, timestamps.
 */

const { EventEmitter } = require('events');
const { v4: uuidv4 } = (() => {
  try { return require('uuid'); } catch { return { v4: () => `${Date.now()}-${Math.random().toString(36).slice(2)}` }; }
})();

const queue = [];          // pending jobs
const jobs = new Map();    // all jobs by id
let processing = false;

const queueEmitter = new EventEmitter();

// ── Job lifecycle ─────────────────────────────────────────────────────────────
function createJob(prompt, options = {}) {
  const id = uuidv4();
  const job = {
    id,
    prompt,
    options,
    status: 'queued',   // queued | running | done | failed | cancelled
    result: null,
    error: null,
    createdAt: Date.now(),
    startedAt: null,
    finishedAt: null,
  };
  jobs.set(id, job);
  queue.push(id);
  queueEmitter.emit('enqueued', { id, position: queue.length });
  // Kick the processor (non-blocking)
  setImmediate(processNext);
  return job;
}

function cancelJob(id) {
  const job = jobs.get(id);
  if (!job) return false;
  if (job.status === 'running') {
    // Can't stop mid-run, mark as cancel-requested
    job.status = 'cancel-requested';
    queueEmitter.emit('cancel-requested', { id });
    return true;
  }
  if (job.status === 'queued') {
    const idx = queue.indexOf(id);
    if (idx !== -1) queue.splice(idx, 1);
    job.status = 'cancelled';
    job.finishedAt = Date.now();
    queueEmitter.emit('cancelled', { id });
    return true;
  }
  return false;
}

function getJob(id) {
  return jobs.get(id) || null;
}

function getAllJobs() {
  return Array.from(jobs.values()).sort((a, b) => b.createdAt - a.createdAt);
}

function getQueueStatus() {
  const pending = queue.length;
  const running = Array.from(jobs.values()).filter(j => j.status === 'running').length;
  const done    = Array.from(jobs.values()).filter(j => j.status === 'done').length;
  const failed  = Array.from(jobs.values()).filter(j => j.status === 'failed').length;
  return { pending, running, done, failed, total: jobs.size };
}

// ── Processor ─────────────────────────────────────────────────────────────────
async function processNext() {
  if (processing || queue.length === 0) return;
  processing = true;

  const id = queue.shift();
  const job = jobs.get(id);
  if (!job || job.status === 'cancelled') {
    processing = false;
    setImmediate(processNext);
    return;
  }

  job.status = 'running';
  job.startedAt = Date.now();
  queueEmitter.emit('started', { id });

  try {
    // Lazy require to avoid circular deps
    const { generateCode } = require('../orchestrator');
    const result = await generateCode(job.prompt, job.options);

    if (job.status === 'cancel-requested') {
      job.status = 'cancelled';
    } else {
      job.status = 'done';
      job.result = result;
    }
    job.finishedAt = Date.now();
    queueEmitter.emit('finished', { id, status: job.status, result });
  } catch (err) {
    job.status = 'failed';
    job.error = err.message || String(err);
    job.finishedAt = Date.now();
    queueEmitter.emit('failed', { id, error: job.error });
  }

  processing = false;
  setImmediate(processNext);
}

// Prune old completed jobs (keep last 50)
function pruneOldJobs(keep = 50) {
  const finished = Array.from(jobs.values())
    .filter(j => ['done', 'failed', 'cancelled'].includes(j.status))
    .sort((a, b) => b.finishedAt - a.finishedAt);
  finished.slice(keep).forEach(j => jobs.delete(j.id));
}

module.exports = {
  createJob,
  cancelJob,
  getJob,
  getAllJobs,
  getQueueStatus,
  queueEmitter,
  pruneOldJobs,
};
