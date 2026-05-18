/**
 * skillLoader.js - Dynamic skill loading from SKILL.md files
 *
 * Reads SKILL.md files from skills/ directory.
 * Parses frontmatter and content.
 * Injects relevant skills into agent prompts.
 * Supports hot-reload and caching.
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(__dirname, '..', 'skills');

/**
 * @typedef {Object} Skill
 * @property {string} name
 * @property {string} description
 * @property {string} version
 * @property {string[]} triggers - Keywords that activate this skill
 * @property {string} content - Full markdown content
 * @property {string} path - File path
 * @property {number} loadedAt - Timestamp
 */

let skillCache = new Map();
let lastScanAt = 0;
const CACHE_TTL_MS = 60_000; // Re-scan skills every 60 seconds

/**
 * Parse frontmatter from SKILL.md content.
 * @param {string} content
 * @returns {{ meta: Object, body: string }}
 */
function parseFrontmatter(content) {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { meta: {}, body: content };
  }

  const [, yamlPart, body] = match;
  const meta = {};

  // Simple YAML parser (handles string, array, boolean)
  for (const line of yamlPart.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();

    if (value.startsWith('[') && value.endsWith(']')) {
      // Array
      meta[key] = value
        .slice(1, -1)
        .split(',')
        .map((v) => v.trim().replace(/['"]/g, ''));
    } else if (value === 'true') {
      meta[key] = true;
    } else if (value === 'false') {
      meta[key] = false;
    } else {
      meta[key] = value.replace(/^["']|["']$/g, '');
    }
  }

  return { meta, body: body.trim() };
}

/**
 * Load all skills from the skills/ directory.
 * @param {boolean} [forceReload=false]
 * @returns {Map<string, Skill>}
 */
function loadAllSkills(forceReload = false) {
  const now = Date.now();
  if (!forceReload && now - lastScanAt < CACHE_TTL_MS && skillCache.size > 0) {
    return skillCache;
  }

  if (!existsSync(SKILLS_DIR)) {
    return skillCache;
  }

  const newCache = new Map();

  try {
    const skillDirs = readdirSync(SKILLS_DIR);

    for (const dir of skillDirs) {
      const skillPath = join(SKILLS_DIR, dir, 'SKILL.md');
      if (!existsSync(skillPath)) continue;

      try {
        const content = readFileSync(skillPath, 'utf-8');
        const { meta, body } = parseFrontmatter(content);

        const skill = {
          name: meta.name || dir,
          description: meta.description || '',
          version: meta.version || '1.0.0',
          triggers: Array.isArray(meta.triggers) ? meta.triggers : [],
          tags: Array.isArray(meta.tags) ? meta.tags : [],
          content: body,
          fullContent: content,
          path: skillPath,
          loadedAt: now,
        };

        newCache.set(skill.name, skill);
      } catch (err) {
        // Skip malformed skill files
        console.warn(`skillLoader: failed to load ${skillPath}: ${err.message}`);
      }
    }
  } catch (err) {
    console.warn(`skillLoader: failed to scan skills dir: ${err.message}`);
  }

  skillCache = newCache;
  lastScanAt = now;
  return skillCache;
}

/**
 * Get a skill by name.
 * @param {string} name
 * @returns {Skill|undefined}
 */
export function getSkill(name) {
  const skills = loadAllSkills();
  return skills.get(name);
}

/**
 * Get all loaded skills.
 * @returns {Skill[]}
 */
export function getAllSkills() {
  const skills = loadAllSkills();
  return Array.from(skills.values());
}

/**
 * Get skills relevant to the current context.
 * @param {Object} opts
 * @param {string} [opts.context] - Current task description
 * @param {string[]} [opts.forceTriggers] - Additional trigger keywords to match
 * @param {number} [opts.limit=3] - Max skills to return
 * @returns {Skill[]}
 */
export function getRelevantSkills({ context = '', forceTriggers = [], limit = 3 } = {}) {
  const skills = loadAllSkills();
  const contextLower = context.toLowerCase();
  const triggerSet = new Set([...forceTriggers.map((t) => t.toLowerCase())]);

  const scored = Array.from(skills.values()).map((skill) => {
    let score = 0;

    // Trigger match (highest weight)
    for (const trigger of skill.triggers) {
      if (contextLower.includes(trigger.toLowerCase())) score += 3;
      if (triggerSet.has(trigger.toLowerCase())) score += 5;
    }

    // Tag match
    for (const tag of skill.tags || []) {
      if (contextLower.includes(tag.toLowerCase())) score += 1;
    }

    // Name match
    if (contextLower.includes(skill.name.toLowerCase())) score += 2;

    return { skill, score };
  });

  return scored
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ skill }) => skill);
}

/**
 * Format skills for prompt injection.
 * @param {Skill[]} skills
 * @param {boolean} [includeFullContent=false] - Include full content or just description
 * @returns {string}
 */
export function formatSkillsForPrompt(skills, includeFullContent = false) {
  if (!skills || skills.length === 0) return '';

  const lines = ['## Active Skills (follow these guidelines):\n'];

  for (const skill of skills) {
    lines.push(`### ${skill.name} (v${skill.version})`);
    lines.push(skill.description);

    if (includeFullContent) {
      lines.push('');
      lines.push(skill.content.slice(0, 2000)); // Cap content length
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Force reload of all skills (hot-reload).
 * @returns {number} Number of skills loaded
 */
export function reloadSkills() {
  skillCache.clear();
  lastScanAt = 0;
  const skills = loadAllSkills(true);
  return skills.size;
}

/**
 * Get skill names list.
 * @returns {string[]}
 */
export function listSkillNames() {
  const skills = loadAllSkills();
  return Array.from(skills.keys());
}

export const skillLoader = {
  getSkill,
  getAllSkills,
  getRelevantSkills,
  formatSkillsForPrompt,
  reloadSkills,
  listSkillNames,
};

export default skillLoader;
