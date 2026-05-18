/**
 * taskBoard.js - Task board with backlog/in_progress/done states
 *
 * Inspired by SwarmClaw's task delegation with explicit status tracking,
 * execution policies, and per-task approval stages.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BOARD_PATH = join(__dirname, '..', 'memory', 'taskboard.json');

function loadBoard() {
  if (!existsSync(BOARD_PATH)) return { tasks: [], updatedAt: null };
  try {
    return JSON.parse(readFileSync(BOARD_PATH, 'utf8'));
  } catch { return { tasks: [], updatedAt: null }; }
}

function saveBoard(board) {
  writeFileSync(BOARD_PATH, JSON.stringify({ ...board, updatedAt: new Date().toISOString() }, null, 2));
}

/**
 * @typedef {'backlog'|'in_progress'|'done'|'blocked'|'cancelled'} TaskStatus
 * @typedef {Object} Task
 * @property {string} id
 * @property {string} title
 * @property {string} [description]
 * @property {TaskStatus} status
 * @property {string} [assignee] - Agent or user handling the task
 * @property {number} priority - 0 (lowest) to 10 (highest)
 * @property {string[]} [tags]
 * @property {string} [blockedBy] - Task ID this is waiting on
 * @property {string} createdAt
 * @property {string} [startedAt]
 * @property {string} [completedAt]
 * @property {string} [result] - Output/result when done
 * @property {string} [executionPolicy] - 'auto' | 'approve' | 'review'
 */

/**
 * Add a task to the board.
 * @param {Partial<Task>} task
 * @returns {Task}
 */
export function addTask({ title, description, priority = 5, tags = [], assignee, executionPolicy = 'auto' }) {
  const board = loadBoard();
  const task = {
    id: randomUUID(),
    title,
    description: description || '',
    status: 'backlog',
    priority,
    tags,
    assignee: assignee || null,
    executionPolicy,
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    result: null,
    blockedBy: null,
  };
  board.tasks.push(task);
  saveBoard(board);
  return task;
}

/**
 * Update a task's status and fields.
 * @param {string} id
 * @param {Partial<Task>} updates
 * @returns {Task|null}
 */
export function updateTask(id, updates) {
  const board = loadBoard();
  const idx = board.tasks.findIndex(t => t.id === id);
  if (idx === -1) return null;

  const task = board.tasks[idx];
  const updated = { ...task, ...updates };

  if (updates.status === 'in_progress' && !task.startedAt) {
    updated.startedAt = new Date().toISOString();
  }
  if (['done', 'cancelled'].includes(updates.status) && !task.completedAt) {
    updated.completedAt = new Date().toISOString();
  }

  board.tasks[idx] = updated;
  saveBoard(board);
  return updated;
}

/**
 * Get tasks by status.
 * @param {TaskStatus} [status]
 * @returns {Task[]}
 */
export function getTasks(status) {
  const board = loadBoard();
  const tasks = board.tasks;
  if (!status) return tasks;
  return tasks.filter(t => t.status === status);
}

/**
 * Get the next task to work on (highest priority backlog task with no blockers).
 * @param {string} [assignee] - Filter by assignee
 * @returns {Task|null}
 */
export function getNextTask(assignee) {
  const board = loadBoard();
  const doneIds = new Set(board.tasks.filter(t => t.status === 'done').map(t => t.id));

  return board.tasks
    .filter(t => {
      if (t.status !== 'backlog') return false;
      if (assignee && t.assignee && t.assignee !== assignee) return false;
      if (t.blockedBy && !doneIds.has(t.blockedBy)) return false;
      return true;
    })
    .sort((a, b) => b.priority - a.priority)[0] || null;
}

/**
 * Get board stats.
 * @returns {Object}
 */
export function getBoardStats() {
  const tasks = getTasks();
  return {
    total: tasks.length,
    backlog: tasks.filter(t => t.status === 'backlog').length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    done: tasks.filter(t => t.status === 'done').length,
    blocked: tasks.filter(t => t.status === 'blocked').length,
    cancelled: tasks.filter(t => t.status === 'cancelled').length,
  };
}

/**
 * Clear completed tasks older than N days.
 * @param {number} [days]
 */
export function pruneCompleted(days = 30) {
  const board = loadBoard();
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  board.tasks = board.tasks.filter(t => {
    if (t.status !== 'done' && t.status !== 'cancelled') return true;
    return !t.completedAt || new Date(t.completedAt).getTime() > cutoff;
  });
  saveBoard(board);
}

export default { addTask, updateTask, getTasks, getNextTask, getBoardStats, pruneCompleted };
