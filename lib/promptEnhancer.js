/**
 * promptEnhancer.js - Injects memory, lessons, instincts, and skills into prompts
 *
 * Every agent prompt is enhanced with relevant context before being sent.
 * This is the core of the system's self-improvement loop.
 */

import { lessonStore } from './lessonStore.js';
import { instinctStore } from './instinctStore.js';
import { successLearner } from './successLearner.js';
import { skillLoader } from './skillLoader.js';

/**
 * @typedef {Object} EnhancementContext
 * @property {string} [prompt] - The base prompt
 * @property {string} [stack] - Tech stack (e.g. "fastapi+react")
 * @property {string} [task] - Task type (planning|coding|qa|search)
 * @property {string[]} [tags] - Context tags
 * @property {boolean} [includeLessons] - Whether to inject failure lessons
 * @property {boolean} [includeInstincts] - Whether to inject instincts
 * @property {boolean} [includeSuccesses] - Whether to inject success patterns
 * @property {boolean} [includeSkills] - Whether to inject relevant skills
 * @property {number} [maxLength] - Max enhancement length in chars
 */

/**
 * Enhance a prompt with all relevant memory context.
 * @param {string} basePrompt
 * @param {EnhancementContext} ctx
 * @returns {string} Enhanced prompt
 */
export function enhancePrompt(basePrompt, ctx = {}) {
  const {
    stack = '',
    task = 'default',
    tags = [],
    includeLessons = true,
    includeInstincts = true,
    includeSuccesses = true,
    includeSkills = true,
    maxLength = 3000,
  } = ctx;

  const sections = [];

  // Failure lessons
  if (includeLessons) {
    const lessons = lessonStore.getRelevantLessons({ stack, query: basePrompt.slice(0, 100), tags, limit: 5 });
    if (lessons.length > 0) {
      sections.push(lessonStore.formatLessonsForPrompt(lessons));
    }
  }

  // Instincts (high-confidence learned patterns)
  if (includeInstincts) {
    const instincts = instinctStore.getRelevantInstincts({ context: stack || task, tags, minConfidence: 0.6, limit: 6 });
    if (instincts.length > 0) {
      const instinctLines = ['## Active Instincts (apply these patterns):\n'];
      for (const i of instincts) {
        instinctLines.push(`- [${Math.round(i.confidence * 100)}% confidence] ${i.pattern}`);
        if (i.context) instinctLines.push(`  When: ${i.context}`);
      }
      sections.push(instinctLines.join('\n'));
    }
  }

  // Success patterns
  if (includeSuccesses) {
    const successes = successLearner.getRelevantSuccesses({ stack, tags, limit: 3 });
    if (successes.length > 0) {
      sections.push(successLearner.formatSuccessesForPrompt(successes));
    }
  }

  // Active skills
  if (includeSkills) {
    const skills = skillLoader.getRelevantSkills({ context: `${stack} ${task} ${basePrompt.slice(0, 200)}`, limit: 2 });
    if (skills.length > 0) {
      sections.push(skillLoader.formatSkillsForPrompt(skills, false));
    }
  }

  if (sections.length === 0) return basePrompt;

  const enhancement = sections.join('\n\n');
  // Respect maxLength
  const capped = enhancement.length > maxLength ? enhancement.slice(0, maxLength) + '\n...(truncated)' : enhancement;

  return `${capped}\n\n---\n\n${basePrompt}`;
}

/**
 * Build a system prompt enhanced with all available context.
 * @param {string} role - Agent role description
 * @param {EnhancementContext} ctx
 * @returns {string} Enhanced system prompt
 */
export function buildSystemPrompt(role, ctx = {}) {
  const baseSystem = `You are ${role}.\n\nYou are part of Orchestrator X — an autonomous multi-agent AI software engineering system. Your outputs are consumed by downstream agents, so always produce clean, structured, complete responses.`;
  return enhancePrompt(baseSystem, { ...ctx, maxLength: 4000 });
}

/**
 * Enhance messages array with a prepended context message.
 * @param {Array} messages - Existing messages array
 * @param {EnhancementContext} ctx
 * @returns {Array} Enhanced messages array
 */
export function enhanceMessages(messages, ctx = {}) {
  const { stack = '', task = 'default', tags = [] } = ctx;

  const lessons = lessonStore.getRelevantLessons({ stack, tags, limit: 3 });
  const instincts = instinctStore.getRelevantInstincts({ context: stack || task, tags, minConfidence: 0.65, limit: 4 });

  if (lessons.length === 0 && instincts.length === 0) return messages;

  const contextParts = [];
  if (lessons.length > 0) contextParts.push(lessonStore.formatLessonsForPrompt(lessons));
  if (instincts.length > 0) {
    const lines = ['## Active Instincts:\n'];
    instincts.forEach((i) => lines.push(`- ${i.pattern}`));
    contextParts.push(lines.join('\n'));
  }

  const contextMsg = {
    role: 'user',
    content: `[Context from memory]\n${contextParts.join('\n\n')}\n\n[End context]`,
  };

  return [contextMsg, ...messages];
}

export const promptEnhancer = { enhancePrompt, buildSystemPrompt, enhanceMessages };
export default promptEnhancer;
