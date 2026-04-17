/**
 * Web Search Agent — Runtime Error Research
 *
 * When a build fails at runtime, this agent searches the web for the error message
 * and injects relevant documentation, solutions, and examples directly into the
 * next fix attempt. Keeps the system from hitting the same wall twice.
 *
 * Supports: Serper API, Brave Search API
 * Fallback: returns empty results gracefully (never blocks pipeline)
 */

const https = require('https');

// ── HTTP helper ───────────────────────────────────────────────────────────────
function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(
      { hostname, path, method: 'POST', headers: { ...headers, 'Content-Length': Buffer.byteLength(data) } },
      res => {
        let raw = '';
        res.on('data', c => raw += c);
        res.on('end', () => {
          try { resolve(JSON.parse(raw)); } catch { resolve({ raw }); }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function httpsGet(hostname, path, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname, path, method: 'GET', headers },
      res => {
        let raw = '';
        res.on('data', c => raw += c);
        res.on('end', () => {
          try { resolve(JSON.parse(raw)); } catch { resolve({ raw }); }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

// ── Serper search ─────────────────────────────────────────────────────────────
async function searchSerper(query, num = 5) {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];
  try {
    const data = await httpsPost(
      'google.serper.dev',
      '/search',
      { 'X-API-KEY': key, 'Content-Type': 'application/json' },
      { q: query, num }
    );
    return (data.organic || []).map(r => ({
      title: r.title,
      url: r.link,
      snippet: r.snippet,
    }));
  } catch {
    return [];
  }
}

// ── Brave search ──────────────────────────────────────────────────────────────
async function searchBrave(query, count = 5) {
  const key = process.env.BRAVE_API_KEY;
  if (!key) return [];
  try {
    const encoded = encodeURIComponent(query);
    const data = await httpsGet(
      'api.search.brave.com',
      `/res/v1/web/search?q=${encoded}&count=${count}`,
      { 'Accept': 'application/json', 'X-Subscription-Token': key }
    );
    return ((data.web && data.web.results) || []).map(r => ({
      title: r.title,
      url: r.url,
      snippet: r.description,
    }));
  } catch {
    return [];
  }
}

// ── Unified search ────────────────────────────────────────────────────────────
async function webSearch(query, maxResults = 5) {
  // Try Serper first, then Brave
  let results = await searchSerper(query, maxResults);
  if (!results.length) results = await searchBrave(query, maxResults);
  return results.slice(0, maxResults);
}

// ── Query builders ────────────────────────────────────────────────────────────
function buildDocQuery(stack, feature) {
  const b = (stack.backend || '').split(' ')[0];
  const f = (stack.frontend || '').split(' ')[0];
  return `${b} ${f} ${feature} implementation example 2024 site:docs.${b.toLowerCase()}.com OR site:github.com`;
}

function buildErrorQuery(errorMsg, stack) {
  const b = (stack.backend || '').split(' ')[0];
  const clean = errorMsg.replace(/at .+:\d+/g, '').substring(0, 100);
  return `${b} ${clean} fix solution stackoverflow github`;
}

// ── Agent entry point ─────────────────────────────────────────────────────────
/**
 * Search for relevant documentation and examples.
 * Returns formatted context block for injection into agent prompts.
 */
async function webSearchAgent(query, stack = {}, maxResults = 4) {
  if (!process.env.SERPER_API_KEY && !process.env.BRAVE_API_KEY) {
    return '';  // No keys — skip silently
  }

  try {
    const results = await webSearch(query, maxResults);
    if (!results.length) return '';
    return formatSearchResults(results, query);
  } catch {
    return '';  // Never block the pipeline
  }
}

/**
 * Search for solutions to a specific error.
 */
async function searchForError(errorMsg, stack = {}) {
  if (!errorMsg) return '';
  const query = buildErrorQuery(errorMsg, stack);
  return webSearchAgent(query, stack, 3);
}

/**
 * Search for documentation for a specific stack + feature.
 */
async function searchForDocs(stack, feature) {
  const query = buildDocQuery(stack, feature);
  return webSearchAgent(query, stack, 4);
}

function formatSearchResults(results, query) {
  if (!results.length) return '';
  const lines = results.map((r, i) =>
    `${i + 1}. ${r.title}\n   ${r.snippet || ''}\n   Source: ${r.url}`
  );
  return `\n🔍 WEB SEARCH RESULTS for "${query.substring(0, 80)}":\n${lines.join('\n')}\n`;
}

module.exports = {
  webSearch,
  webSearchAgent,
  searchForError,
  searchForDocs,
  buildDocQuery,
  buildErrorQuery,
};
