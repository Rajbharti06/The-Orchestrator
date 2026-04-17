/**
 * Lesson Store — Persistent Failure Learning
 *
 * Every failed build is analyzed by an LLM that identifies the root cause
 * and writes a concrete prevention rule. On the next run, relevant rules
 * are injected into agent prompts so the same mistake isn't repeated.
 *
 * Flow: build fails → LLM reflects → lesson stored → injected on next run
 */

const fs = require('fs');
const path = require('path');

const LESSONS_DIR  = path.join(process.cwd(), 'memory');
const LESSONS_FILE = path.join(LESSONS_DIR, 'lessons.json');
const MAX_LESSONS  = 100;

// ── Storage ───────────────────────────────────────────────────────────────────
function loadLessons() {
  try {
    return JSON.parse(fs.readFileSync(LESSONS_FILE, 'utf8'));
  } catch {
    return { lessons: [] };
  }
}

function saveLessons(data) {
  if (!fs.existsSync(LESSONS_DIR)) fs.mkdirSync(LESSONS_DIR, { recursive: true });
  if (data.lessons.length > MAX_LESSONS) data.lessons = data.lessons.slice(-MAX_LESSONS);
  fs.writeFileSync(LESSONS_FILE, JSON.stringify(data, null, 2));
}

// ── Extraction (LLM reflection) ────────────────────────────────────────────
async function extractLesson(prompt, issues, files) {
  const { chatCompletion, extractJSON } = require('./llmRouter');

  const systemMsg = `
You are a reflective senior engineer analyzing why code generation failed.
Produce a concise, actionable lesson from this failure.

Return ONLY JSON:
{
  "lesson": "1-2 sentence summary of what specifically went wrong and why",
  "tags": ["array", "of", "topic", "keywords", "matching", "the", "domain"],
  "severity": "critical|high|medium",
  "prevention": "Exact instruction to prevent this in future generation"
}
`.trim();

  const issueList = (issues || []).slice(0, 5)
    .map(i => `[${(i.severity || 'high').toUpperCase()}] ${i.description}. Fix: ${i.fix || 'N/A'}`)
    .join('\n');

  try {
    const content = await chatCompletion({
      messages: [
        { role: 'system', content: systemMsg },
        {
          role: 'user',
          content: `Prompt: "${prompt.substring(0, 200)}"\n\nIssues:\n${issueList}\n\nFiles: ${(files || []).map(f => f.path).join(', ')}`,
        },
      ],
      taskType: 'qa',
    });
    return extractJSON(content);
  } catch {
    // Fallback: synthesize without LLM
    return {
      lesson: issues.slice(0, 2).map(i => i.description).join('; '),
      tags: inferTags(prompt),
      severity: issues[0]?.severity || 'medium',
      prevention: issues.map(i => i.fix).filter(Boolean)[0] || 'Review implementation carefully',
    };
  }
}

function inferTags(prompt) {
  const p = (prompt || '').toLowerCase();
  const known = ['auth', 'login', 'jwt', 'database', 'api', 'frontend', 'backend',
    'react', 'fastapi', 'django', 'express', 'postgres', 'chat', 'payment', 'deploy'];
  return known.filter(t => p.includes(t));
}

// ── Public API ────────────────────────────────────────────────────────────────
async function recordLesson(prompt, issues, files) {
  if (!issues || !issues.length) return null;
  const data = loadLessons();
  const lesson = await extractLesson(prompt, issues, files);
  data.lessons.push({ ...lesson, prompt: prompt.substring(0, 120), ts: Date.now() });
  saveLessons(data);
  return lesson;
}

/**
 * Retrieve lessons relevant to the current prompt.
 * Scores by tag overlap, returns top N.
 */
function getRelevantLessons(prompt, maxLessons = 6) {
  const data = loadLessons();
  const p = (prompt || '').toLowerCase();

  return data.lessons
    .map(l => {
      const tags = l.tags || [];
      const score = tags.filter(t => p.includes(t.toLowerCase())).length;
      return { lesson: l, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxLessons)
    .map(x => x.lesson);
}

/**
 * Format lessons as a prompt injection block.
 * Agents receive this so they avoid repeating past mistakes.
 */
function formatLessonsForPrompt(lessons) {
  if (!lessons || !lessons.length) return '';
  const lines = lessons.map((l, i) =>
    `${i + 1}. [${(l.severity || 'medium').toUpperCase()}] ${l.lesson}\n   → Prevention: ${l.prevention}`
  );
  return `\n⚠️  LESSONS FROM PAST FAILURES — apply these to avoid repeating mistakes:\n${lines.join('\n')}\n`;
}

module.exports = { recordLesson, getRelevantLessons, formatLessonsForPrompt, loadLessons };
