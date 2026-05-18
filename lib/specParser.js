/**
 * specParser.js - Multi-Format Spec Parser (Loki Mode)
 *
 * Auto-detects and parses PRDs, OpenAPI specs, GitHub issues, or one-line briefs
 * into a normalized BuildSpec, then converts to an optimized orchestrator prompt.
 */

/**
 * @typedef {Object} BuildSpec
 * @property {'prd'|'openapi'|'github-issue'|'brief'} type
 * @property {string} title
 * @property {string} description
 * @property {string[]} [endpoints]
 * @property {Record<string, any>} [schema]
 * @property {string[]} acceptanceCriteria
 * @property {'low'|'medium'|'high'|'unknown'} estimatedComplexity
 */

// ---------------------------------------------------------------------------
// Format detection
// ---------------------------------------------------------------------------

function detectFormat(input) {
  const trimmed = input.trim();
  if (/^openapi:\s*['""]?3|^swagger:\s*['""]?[12]/im.test(trimmed)) return 'openapi';
  if (/^(feat|fix|chore|docs|refactor|perf|test)(\(.+?\))?: .+/.test(trimmed) || /github\.com\/.+\/issues\/\d+/.test(trimmed)) return 'github-issue';
  if (trimmed.startsWith('#') || /^## /m.test(trimmed)) return 'prd';
  return 'brief';
}

// ---------------------------------------------------------------------------
// PRD parser
// ---------------------------------------------------------------------------

/**
 * Parse a markdown PRD into structured fields.
 * @param {string} markdown
 * @returns {BuildSpec}
 */
export function parsePRD(markdown) {
  const lines = markdown.split('\n');
  const title = lines.find(l => l.startsWith('# '))?.replace(/^# /, '').trim() ?? 'Untitled';
  const extract = (heading) => {
    const idx = lines.findIndex(l => new RegExp(`^#{1,3}\\s*${heading}`, 'i').test(l));
    if (idx < 0) return [];
    const section = [];
    for (let i = idx + 1; i < lines.length; i++) {
      if (/^#{1,3}\s/.test(lines[i])) break;
      if (lines[i].trim()) section.push(lines[i].replace(/^[-*•]\s*/, '').trim());
    }
    return section;
  };
  const goals   = extract('goals?|objectives?');
  const stories = extract('user stories?');
  const ac      = extract('acceptance criteria|done criteria');
  const tech    = extract('tech(?:nical)? requirements?|tech stack');
  const desc    = goals.join(' ') || stories.join(' ') || '';
  return {
    type: 'prd',
    title,
    description: desc,
    userStories: stories,
    techRequirements: tech,
    acceptanceCriteria: ac,
    estimatedComplexity: ac.length > 5 || tech.length > 3 ? 'high' : ac.length > 2 ? 'medium' : 'low',
  };
}

// ---------------------------------------------------------------------------
// OpenAPI parser
// ---------------------------------------------------------------------------

/**
 * Parse an OpenAPI/Swagger YAML string into structured fields.
 * @param {string} yaml
 * @returns {BuildSpec}
 */
export function parseOpenAPI(yaml) {
  const endpoints = [];
  const methodRx = /^\s{2}(\/[^\s:]+):/gm;
  let m;
  while ((m = methodRx.exec(yaml)) !== null) endpoints.push(m[1]);

  const title = yaml.match(/title:\s*["']?([^"'\n]+)/)?.[1]?.trim() ?? 'OpenAPI Spec';
  const authTypes = [];
  if (/bearerAuth|bearer/i.test(yaml)) authTypes.push('bearer');
  if (/apiKey/i.test(yaml))            authTypes.push('apiKey');
  if (/oauth/i.test(yaml))             authTypes.push('oauth2');

  return {
    type: 'openapi',
    title,
    description: `OpenAPI specification with ${endpoints.length} endpoint(s).`,
    endpoints: [...new Set(endpoints)],
    auth: authTypes,
    schema: {},
    acceptanceCriteria: endpoints.map(e => `Endpoint ${e} responds correctly`),
    estimatedComplexity: endpoints.length > 10 ? 'high' : endpoints.length > 4 ? 'medium' : 'low',
  };
}

// ---------------------------------------------------------------------------
// GitHub issue parser
// ---------------------------------------------------------------------------

/**
 * Parse a GitHub issue or conventional commit string.
 * @param {string} text
 * @returns {BuildSpec}
 */
export function parseGithubIssue(text) {
  const conventionalMatch = text.match(/^(feat|fix|chore|docs|refactor|perf|test)(\((.+?)\))?: (.+)/);
  const title = conventionalMatch ? conventionalMatch[4] : text.split('\n')[0].replace(/^#+\s*/, '').trim();
  const labels = conventionalMatch ? [conventionalMatch[1]] : [];
  const bodyLines = text.split('\n').slice(1).filter(l => l.trim());
  const ac = bodyLines.filter(l => /\b(should|must|shall|given|when|then|accept)/i.test(l));
  return {
    type: 'github-issue',
    title,
    description: bodyLines.slice(0, 3).join(' '),
    labels,
    acceptanceCriteria: ac.length ? ac : [`Implement: ${title}`],
    estimatedComplexity: bodyLines.length > 10 ? 'medium' : 'low',
  };
}

// ---------------------------------------------------------------------------
// One-liner
// ---------------------------------------------------------------------------

/**
 * Treat the entire input as a one-line brief.
 * @param {string} text
 * @returns {BuildSpec}
 */
export function parseOneLiner(text) {
  return {
    type: 'brief',
    title: text.slice(0, 80),
    description: text,
    acceptanceCriteria: [`Build a working application from: "${text.slice(0, 100)}"`],
    estimatedComplexity: 'unknown',
  };
}

// ---------------------------------------------------------------------------
// Auto-detect dispatcher
// ---------------------------------------------------------------------------

/**
 * Auto-detect spec format and parse it.
 * @param {string} input
 * @param {object} [opts]
 * @returns {Promise<BuildSpec>}
 */
export async function parseSpec(input, opts = {}) {
  try {
    const format = detectFormat(input);
    switch (format) {
      case 'prd':          return parsePRD(input);
      case 'openapi':      return parseOpenAPI(input);
      case 'github-issue': return parseGithubIssue(input);
      default:             return parseOneLiner(input);
    }
  } catch (err) {
    return parseOneLiner(input);
  }
}

// ---------------------------------------------------------------------------
// Spec → Prompt
// ---------------------------------------------------------------------------

/**
 * Convert a BuildSpec into an optimized orchestrator prompt.
 * @param {BuildSpec} spec
 * @returns {Promise<string>}
 */
export async function specToPrompt(spec) {
  const lines = [`Build the following application:`, ``, `**Title:** ${spec.title}`, `**Type:** ${spec.type}`, ``];
  if (spec.description) lines.push(`**Description:** ${spec.description}`, ``);
  if (spec.endpoints?.length) lines.push(`**API Endpoints:** ${spec.endpoints.join(', ')}`, ``);
  if (spec.techRequirements?.length) lines.push(`**Tech Requirements:**`, ...spec.techRequirements.map(r => `- ${r}`), ``);
  if (spec.acceptanceCriteria?.length) lines.push(`**Acceptance Criteria:**`, ...spec.acceptanceCriteria.map(c => `- ${c}`), ``);
  lines.push(`**Estimated Complexity:** ${spec.estimatedComplexity}`);
  return lines.join('\n');
}

export default { parseSpec, parsePRD, parseOpenAPI, parseGithubIssue, parseOneLiner, specToPrompt };
