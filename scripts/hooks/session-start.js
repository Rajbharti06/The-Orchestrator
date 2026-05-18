#!/usr/bin/env node
/**
 * session-start.js - Load relevant context at session start
 *
 * Reads memory state and prints a brief intelligence summary
 * to prime Claude with current system state.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const memDir = join(__dirname, '..', '..', 'memory');

function readJSON(path, fallback = []) {
  try {
    if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf-8'));
  } catch { /* */ }
  return fallback;
}

const lessons = readJSON(join(memDir, 'lessons.json'));
const instincts = readJSON(join(memDir, 'instincts.json'));
const successes = readJSON(join(memDir, 'successes.json'));
const history = readJSON(join(memDir, 'history.json'));

const topLessons = lessons
  .sort((a, b) => b.occurrences - a.occurrences)
  .slice(0, 3);

const topInstincts = instincts
  .filter(i => i.confidence >= 0.7)
  .sort((a, b) => b.confidence - a.confidence)
  .slice(0, 3);

const recentBuilds = history.slice(0, 3);
const successRate = history.length > 0
  ? Math.round(history.filter(b => b.outcome === 'success').length / history.length * 100)
  : 0;

if (topLessons.length > 0 || topInstincts.length > 0) {
  process.stdout.write('\n[Orchestrator X — Session Context]\n\n');

  if (topLessons.length > 0) {
    process.stdout.write('Top lessons (avoid these mistakes):\n');
    topLessons.forEach(l => {
      process.stdout.write(`  ⚠ ${l.issue.slice(0, 80)}\n`);
      process.stdout.write(`    → ${l.fix.slice(0, 80)}\n`);
    });
    process.stdout.write('\n');
  }

  if (topInstincts.length > 0) {
    process.stdout.write('Active instincts (apply these patterns):\n');
    topInstincts.forEach(i => {
      process.stdout.write(`  [${Math.round(i.confidence * 100)}%] ${i.pattern.slice(0, 80)}\n`);
    });
    process.stdout.write('\n');
  }

  if (history.length > 0) {
    process.stdout.write(`Build history: ${history.length} builds, ${successRate}% success rate\n`);
    process.stdout.write('\n');
  }
}

process.exit(0);
