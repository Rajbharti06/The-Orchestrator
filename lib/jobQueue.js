/**
 * jobQueue.js - Async job queue for build pipeline management
 *
 * Manages concurrent builds with priority, cancellation, and status tracking.
 * Supports at most N concurrent jobs (default: 2).
 */

import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';

export const jobEvents = new EventEmitter();

/**
 * @typedef {'queued'|'running'|'completed'|'failed'|'cancelled'} JobStatus
 * @typedef {Object} Job
 * @property {string} id
 * @property {string} prompt
 * @property {Object} options
 * @property {JobStatus} status
 * @property {number} priority
 * @property {string} createdAt
 * @property {string|null} startedAt
 * @property {string|null} completedAt
 * @property {any} result
 * @property {string|null} error
 * @property {Function|null} cancelFn
 * @property {string[]} logs
 */

const MAX_CONCURRENT = 2;
const MAX_HISTORY = 50;

/** @type {Job[]} */
let queue = [];
/** @type {Job[]} */
let history = [];
let running = 0;

/** @type {Function|null} Current build runner injected from orchestrator */
let buildRunner = null;

/**
 * Register the function that actually runs a build.
 * @param {Function} fn - async (job) => result
 */
export function registerRunner(fn) {
  buildRunner = fn;
}

/**
 * Add a job to the queue.
 * @param {string} prompt
 * @param {Object} [options]
 * @param {number} [priority=0] - Higher = run sooner
 * @returns {Job}
 */
export function enqueue(prompt, options = {}, priority = 0) {
  const job = {
    id: randomUUID(),
    prompt,
    options,
    status: 'queued',
    priority,
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    result: null,
    error: null,
    cancelFn: null,
    logs: [],
  };

  queue.push(job);
  queue.sort((a, b) => b.priority - a.priority);

  jobEvents.emit('queued', job);
  scheduleNext();
  return job;
}

/**
 * Cancel a queued or running job.
 * @param {string} jobId
 * @returns {boolean}
 */
export function cancelJob(jobId) {
  const queued = queue.find((j) => j.id === jobId);
  if (queued) {
    queued.status = 'cancelled';
    queued.completedAt = new Date().toISOString();
    queue = queue.filter((j) => j.id !== jobId);
    archiveJob(queued);
    jobEvents.emit('cancelled', queued);
    return true;
  }

  const running_job = history.find((j) => j.id === jobId && j.status === 'running');
  if (running_job && running_job.cancelFn) {
    running_job.cancelFn();
    return true;
  }

  return false;
}

/**
 * Get a job by ID (from queue or history).
 * @param {string} jobId
 * @returns {Job|undefined}
 */
export function getJob(jobId) {
  return queue.find((j) => j.id === jobId) || history.find((j) => j.id === jobId);
}

/**
 * Get all queued jobs.
 * @returns {Job[]}
 */
export function getQueue() {
  return [...queue];
}

/**
 * Get job history (completed, failed, cancelled).
 * @param {number} [limit=20]
 * @returns {Job[]}
 */
export function getHistory(limit = 20) {
  return history.slice(0, limit);
}

/**
 * Append a log line to a job.
 * @param {string} jobId
 * @param {string} line
 */
export function appendLog(jobId, line) {
  const job = getJob(jobId);
  if (job) {
    job.logs.push(`[${new Date().toISOString()}] ${line}`);
    if (job.logs.length > 500) job.logs.shift(); // Cap log size
    jobEvents.emit('log', { jobId, line, timestamp: new Date().toISOString() });
  }
}

/**
 * Schedule the next queued job if capacity allows.
 */
function scheduleNext() {
  if (running >= MAX_CONCURRENT || queue.length === 0 || !buildRunner) return;

  const job = queue.shift();
  if (!job || job.status === 'cancelled') {
    scheduleNext();
    return;
  }

  job.status = 'running';
  job.startedAt = new Date().toISOString();
  running++;
  history.unshift(job);

  jobEvents.emit('started', job);

  let cancelled = false;
  job.cancelFn = () => {
    cancelled = true;
    job.status = 'cancelled';
    job.completedAt = new Date().toISOString();
    running--;
    jobEvents.emit('cancelled', job);
    scheduleNext();
  };

  buildRunner(job)
    .then((result) => {
      if (cancelled) return;
      job.status = 'completed';
      job.result = result;
      job.completedAt = new Date().toISOString();
      job.cancelFn = null;
      running--;
      jobEvents.emit('completed', job);
      trimHistory();
      scheduleNext();
    })
    .catch((err) => {
      if (cancelled) return;
      job.status = 'failed';
      job.error = err.message || String(err);
      job.completedAt = new Date().toISOString();
      job.cancelFn = null;
      running--;
      jobEvents.emit('failed', job);
      trimHistory();
      scheduleNext();
    });
}

function archiveJob(job) {
  history.unshift(job);
  trimHistory();
}

function trimHistory() {
  if (history.length > MAX_HISTORY) {
    history = history.slice(0, MAX_HISTORY);
  }
}

/**
 * Get queue stats.
 * @returns {Object}
 */
export function getStats() {
  return {
    queued: queue.length,
    running,
    completed: history.filter((j) => j.status === 'completed').length,
    failed: history.filter((j) => j.status === 'failed').length,
    cancelled: history.filter((j) => j.status === 'cancelled').length,
    maxConcurrent: MAX_CONCURRENT,
  };
}

export const jobQueue = { enqueue, cancelJob, getJob, getQueue, getHistory, getStats, appendLog, registerRunner, jobEvents };
export default jobQueue;
