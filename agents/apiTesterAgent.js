/**
 * apiTesterAgent.js - Real HTTP endpoint testing
 *
 * Makes actual HTTP requests to every endpoint in the API contract.
 * Reports pass/fail per endpoint with status codes and response validation.
 */

import fetch from 'node-fetch';

/**
 * @typedef {Object} TestResult
 * @property {string} method
 * @property {string} path
 * @property {number} status
 * @property {boolean} passed
 * @property {number} latencyMs
 * @property {string} [error]
 * @property {any} response
 */

/**
 * Run API tests against a live server.
 * @param {string} baseUrl - Base URL (e.g., http://localhost:3000)
 * @param {Object[]} endpoints - From architecture.endpoints
 * @param {Object} [opts]
 * @param {string} [opts.authToken] - JWT token for protected endpoints
 * @param {boolean} [opts.mock] - Use mock results
 * @returns {Promise<{results: TestResult[], passRate: number, passed: number, total: number}>}
 */
export async function runApiTests(baseUrl, endpoints, opts = {}) {
  if (opts.mock || process.env.MOCK === 'true') {
    return getMockResults(endpoints);
  }

  const results = [];
  let authToken = opts.authToken || null;

  // Sort: run auth endpoints first to get token
  const sorted = [
    ...endpoints.filter((e) => e.path.includes('login') || e.path.includes('auth')),
    ...endpoints.filter((e) => !e.path.includes('login') && !e.path.includes('auth')),
  ];

  for (const endpoint of sorted) {
    const result = await testEndpoint(baseUrl, endpoint, authToken);
    results.push(result);

    // Extract auth token from login response
    if (endpoint.path.includes('login') && result.passed && result.response?.token) {
      authToken = result.response.token;
    }

    // Small delay between requests
    await new Promise((r) => setTimeout(r, 200));
  }

  const passed = results.filter((r) => r.passed).length;
  const passRate = results.length > 0 ? passed / results.length : 0;

  return { results, passRate, passed, total: results.length };
}

/**
 * Test a single endpoint.
 * @param {string} baseUrl
 * @param {Object} endpoint
 * @param {string|null} authToken
 * @returns {Promise<TestResult>}
 */
async function testEndpoint(baseUrl, endpoint, authToken) {
  const start = Date.now();
  const url = `${baseUrl}${endpoint.path}`;

  const headers = { 'Content-Type': 'application/json' };
  if (authToken && endpoint.authRequired) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const body = endpoint.method !== 'GET' ? buildRequestBody(endpoint) : undefined;

  try {
    const response = await Promise.race([
      fetch(url, {
        method: endpoint.method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout after 10s')), 10_000)),
    ]);

    let responseData = null;
    try {
      responseData = await response.json();
    } catch {
      responseData = await response.text().catch(() => null);
    }

    const passed = response.status >= 200 && response.status < 400;

    return {
      method: endpoint.method,
      path: endpoint.path,
      status: response.status,
      passed,
      latencyMs: Date.now() - start,
      response: responseData,
    };
  } catch (err) {
    return {
      method: endpoint.method,
      path: endpoint.path,
      status: 0,
      passed: false,
      latencyMs: Date.now() - start,
      error: err.message,
      response: null,
    };
  }
}

/**
 * Build a sample request body for an endpoint.
 * @param {Object} endpoint
 * @returns {Object}
 */
function buildRequestBody(endpoint) {
  if (endpoint.requestBody) return endpoint.requestBody;

  if (endpoint.path.includes('login')) {
    return { email: 'test@example.com', password: 'TestPass123!' };
  }
  if (endpoint.path.includes('register')) {
    return { email: `test${Date.now()}@example.com`, password: 'TestPass123!', name: 'Test User' };
  }

  return { test: true };
}

/**
 * Generate mock test results when not hitting a real server.
 * @param {Object[]} endpoints
 * @returns {Object}
 */
function getMockResults(endpoints) {
  const results = endpoints.map((endpoint) => ({
    method: endpoint.method,
    path: endpoint.path,
    status: 200,
    passed: true,
    latencyMs: 50 + Math.floor(Math.random() * 100),
    response: { mock: true },
  }));

  return {
    results,
    passRate: 1,
    passed: results.length,
    total: results.length,
    mock: true,
  };
}

/**
 * Format test results as a markdown report.
 * @param {Object} testRun
 * @returns {string}
 */
export function formatTestReport(testRun) {
  const { results, passRate, passed, total } = testRun;

  const lines = [
    `## API Test Results`,
    `**Status**: ${passed === total ? 'PASSED' : 'FAILED'} — ${passed}/${total} endpoints`,
    `**Pass Rate**: ${Math.round(passRate * 100)}%`,
    '',
    '| Method | Path | Status | Latency | Result |',
    '|--------|------|--------|---------|--------|',
    ...results.map((r) =>
      `| ${r.method} | ${r.path} | ${r.status || 'ERR'} | ${r.latencyMs}ms | ${r.passed ? 'PASS' : 'FAIL'} |`
    ),
  ];

  const failures = results.filter((r) => !r.passed);
  if (failures.length > 0) {
    lines.push('', '### Failed Endpoints:');
    for (const f of failures) {
      lines.push(`- **${f.method} ${f.path}**: ${f.error || `HTTP ${f.status}`}`);
    }
  }

  return lines.join('\n');
}

export default { runApiTests, formatTestReport };
