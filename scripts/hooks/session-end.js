#!/usr/bin/env node
/**
 * session-end.js - Save session summary at end
 *
 * Records the session end time and any instinct updates.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const memDir = join(__dirname, '..', '..', 'memory');

if (!existsSync(memDir)) mkdirSync(memDir, { recursive: true });

const sessionLog = join(memDir, 'sessions.json');
let sessions = [];
try {
  if (existsSync(sessionLog)) sessions = JSON.parse(readFileSync(sessionLog, 'utf-8'));
} catch { /* */ }

sessions.unshift({ endedAt: new Date().toISOString() });
if (sessions.length > 50) sessions = sessions.slice(0, 50);

try {
  writeFileSync(sessionLog, JSON.stringify(sessions, null, 2));
} catch { /* non-critical */ }

process.exit(0);
