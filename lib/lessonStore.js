/**
 * lessonStore.js - Failure pattern learning system
 *
 * Stores failure patterns encountered during builds with causes and fixes.
 * Retrieved and injected into agent prompts to prevent repeating mistakes.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LESSONS_PATH = join(__dirname, '..', 'memory', 'lessons.json');

/**
 * @typedef {Object} Lesson
 * @property {string} id
 * @property {string} issue - What went wrong
 * @property {string} cause - Why it went wrong
 * @property {string} fix - How to fix or avoid it
 * @property {string} stack - Tech stack context (e.g. "fastapi+react")
 * @property {string[]} tags - Searchable tags
 * @property {number} occurrences - How many times this has been seen
 * @property {string} created - ISO timestamp
 * @property {string} updated - ISO timestamp
 */

let lessons = [];

function ensureMemoryDir() {
  const memDir = join(__dirname, '..', 'memory');
  if (!existsSync(memDir)) mkdirSync(memDir, { recursive: true });
}

function loadLessons() {
  try {
    ensureMemoryDir();
    if (existsSync(LESSONS_PATH)) {
      lessons = JSON.parse(readFileSync(LESSONS_PATH, 'utf-8'));
    }
  } catch {
    lessons = [];
  }
}

function saveLessons() {
  try {
    ensureMemoryDir();
    writeFileSync(LESSONS_PATH, JSON.stringify(lessons, null, 2));
  } catch {
    // Non-critical
  }
}

loadLessons();

/**
 * Add a new lesson (or increment occurrence count if similar exists).
 * @param {Object} opts
 * @param {string} opts.issue - What went wrong
 * @param {string} opts.cause - Root cause
 * @param {string} opts.fix - How to fix/avoid
 * @param {string} [opts.stack] - Tech stack context
 * @param {string[]} [opts.tags] - Tags for search
 * @returns {Lesson}
 */
export function addLesson({ issue, cause, fix, stack = '', tags = [] }) {
  // Check for similar existing lesson
  const existing = lessons.find(
    (l) =>
      l.issue.toLowerCase().includes(issue.toLowerCase().slice(0, 40)) ||
      issue.toLowerCase().includes(l.issue.toLowerCase().slice(0, 40))
  );

  if (existing) {
    existing.occurrences++;
    existing.updated = new Date().toISOString();
    // Update fix if provided
    if (fix && fix.length > existing.fix.length) existing.fix = fix;
    saveLessons();
    return existing;
  }

  const lesson = {
    id: randomUUID(),
    issue,
    cause,
    fix,
    stack,
    tags,
    occurrences: 1,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };

  lessons.push(lesson);
  saveLessons();
  return lesson;
}

/**
 * Get lessons relevant to the current context.
 * @param {Object} opts
 * @param {string} [opts.stack] - Current tech stack
 * @param {string} [opts.query] - Search text
 * @param {string[]} [opts.tags] - Tags to match
 * @param {number} [opts.limit=8] - Max lessons to return
 * @returns {Lesson[]}
 */
export function getRelevantLessons({ stack = '', query = '', tags = [], limit = 8 } = {}) {
  const stackLower = stack.toLowerCase();
  const queryLower = query.toLowerCase();
  const tagSet = new Set(tags.map((t) => t.toLowerCase()));

  return lessons
    .filter((l) => {
      const stackMatch = !stack || l.stack.toLowerCase().includes(stackLower) || stackLower.includes(l.stack.toLowerCase()) || l.stack === '';
      const queryMatch = !query || l.issue.toLowerCase().includes(queryLower) || l.cause.toLowerCase().includes(queryLower);
      const tagMatch = tags.length === 0 || l.tags.some((t) => tagSet.has(t.toLowerCase()));
      return stackMatch || queryMatch || tagMatch;
    })
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, limit);
}

/**
 * Get all lessons.
 * @returns {Lesson[]}
 */
export function getAllLessons() {
  return [...lessons].sort((a, b) => b.occurrences - a.occurrences);
}

/**
 * Get a single lesson by ID.
 * @param {string} id
 * @returns {Lesson|undefined}
 */
export function getLessonById(id) {
  return lessons.find((l) => l.id === id);
}

/**
 * Delete a lesson by ID.
 * @param {string} id
 * @returns {boolean}
 */
export function deleteLesson(id) {
  const before = lessons.length;
  lessons = lessons.filter((l) => l.id !== id);
  saveLessons();
  return lessons.length < before;
}

/**
 * Format lessons for prompt injection.
 * @param {Lesson[]} lessonList
 * @returns {string} Formatted text for LLM context
 */
export function formatLessonsForPrompt(lessonList) {
  if (!lessonList || lessonList.length === 0) return '';

  const lines = ['## Lessons Learned (avoid these known mistakes):\n'];
  for (const lesson of lessonList) {
    lines.push(`**Issue**: ${lesson.issue}`);
    lines.push(`**Cause**: ${lesson.cause}`);
    lines.push(`**Fix**: ${lesson.fix}`);
    if (lesson.stack) lines.push(`**Stack**: ${lesson.stack}`);
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * Auto-summarize repeated failures into a single lesson.
 * @param {number} [threshold=3] - Occurrences before summarizing
 */
export function summarizeRepeatFailures(threshold = 3) {
  const repeated = lessons.filter((l) => l.occurrences >= threshold);
  return repeated.map((l) => ({
    ...l,
    summary: `This issue has occurred ${l.occurrences}x. Priority: HIGH. ${l.fix}`,
  }));
}

export const lessonStore = {
  addLesson,
  getRelevantLessons,
  getAllLessons,
  getLessonById,
  deleteLesson,
  formatLessonsForPrompt,
  summarizeRepeatFailures,
};

export default lessonStore;
