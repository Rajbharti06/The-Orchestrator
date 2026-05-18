/**
 * swarmCoordinator.js - 8-Swarm Architecture (Loki Mode)
 *
 * Organizes agents into 8 specialized swarms with parallel/sequential execution.
 * Fan-out to multiple swarms, fan-in results, complexity-based team assembly.
 */

/**
 * @typedef {Object} Swarm
 * @property {string} name
 * @property {string[]} agents
 * @property {string} purpose
 * @property {number} parallelism  - max concurrent agents (1 = sequential)
 * @property {'parallel'|'sequential'} mode
 */

// ---------------------------------------------------------------------------
// Built-in swarm definitions
// ---------------------------------------------------------------------------

export const SWARMS = {
  engineering: {
    name: 'engineering',
    agents: ['architect', 'backend', 'frontend', 'database'],
    purpose: 'Design and build the full-stack application',
    parallelism: 2,
    mode: 'parallel',
  },
  operations: {
    name: 'operations',
    agents: ['runner', 'deployer', 'monitor'],
    purpose: 'Deploy, run, and monitor the application',
    parallelism: 1,
    mode: 'sequential',
  },
  business: {
    name: 'business',
    agents: ['planner', 'strategist'],
    purpose: 'Decompose business requirements into technical goals',
    parallelism: 1,
    mode: 'sequential',
  },
  data: {
    name: 'data',
    agents: ['dataModeler', 'migrationAgent', 'analyticsAgent'],
    purpose: 'Design schemas, run migrations, provide analytics',
    parallelism: 2,
    mode: 'parallel',
  },
  product: {
    name: 'product',
    agents: ['specParser', 'uxDesigner', 'apiDesigner'],
    purpose: 'Translate product requirements into specs and APIs',
    parallelism: 2,
    mode: 'parallel',
  },
  growth: {
    name: 'growth',
    agents: ['seoAgent', 'performanceAgent', 'analyticsAgent'],
    purpose: 'Optimize for discoverability, speed, and growth metrics',
    parallelism: 3,
    mode: 'parallel',
  },
  review: {
    name: 'review',
    agents: ['codeReviewer', 'securityReviewer', 'qaAgent'],
    purpose: 'Verify code quality, security, and test coverage',
    parallelism: 3,
    mode: 'parallel',
  },
  orchestration: {
    name: 'orchestration',
    agents: ['planner', 'supervisor', 'scribe'],
    purpose: 'Coordinate multi-swarm tasks and record outcomes',
    parallelism: 1,
    mode: 'sequential',
  },
};

/** Runtime swarm status tracking */
const _status = {};
for (const name of Object.keys(SWARMS)) {
  _status[name] = { active: 0, completed: 0, errors: 0 };
}

// ---------------------------------------------------------------------------
// Custom swarms
// ---------------------------------------------------------------------------

const _customSwarms = {};

/**
 * Create a custom swarm config.
 * @param {string} name
 * @param {string[]} agents
 * @param {{ purpose?: string, parallelism?: number, mode?: 'parallel'|'sequential' }} opts
 * @returns {Swarm}
 */
export function createSwarm(name, agents, opts = {}) {
  const swarm = {
    name,
    agents,
    purpose:     opts.purpose     ?? 'Custom swarm',
    parallelism: opts.parallelism ?? agents.length,
    mode:        opts.mode        ?? 'parallel',
  };
  _customSwarms[name] = swarm;
  _status[name] = { active: 0, completed: 0, errors: 0 };
  return swarm;
}

function resolveSwarm(swarmName) {
  return _customSwarms[swarmName] ?? SWARMS[swarmName];
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

/**
 * Run all agents in a swarm (parallel or sequential).
 * @param {string} swarmName
 * @param {any} task
 * @param {Record<string, (task: any) => Promise<any>>} context - map of agentName → fn
 * @returns {Promise<Array<{agent: string, result: any, error?: string}>>}
 */
export async function runSwarm(swarmName, task, context = {}) {
  const swarm = resolveSwarm(swarmName);
  if (!swarm) throw new Error(`Unknown swarm: "${swarmName}"`);

  _status[swarmName] = _status[swarmName] ?? { active: 0, completed: 0, errors: 0 };

  const runAgent = async (agentName) => {
    _status[swarmName].active++;
    try {
      const fn = context[agentName];
      const result = typeof fn === 'function' ? await fn(task) : { skipped: true, reason: 'No agent function provided' };
      _status[swarmName].completed++;
      return { agent: agentName, result };
    } catch (err) {
      _status[swarmName].errors++;
      return { agent: agentName, result: null, error: err.message };
    } finally {
      _status[swarmName].active = Math.max(0, _status[swarmName].active - 1);
    }
  };

  if (swarm.mode === 'sequential') {
    const results = [];
    for (const agent of swarm.agents) results.push(await runAgent(agent));
    return results;
  }

  // Parallel with concurrency limit
  const results = [];
  const chunks = [];
  for (let i = 0; i < swarm.agents.length; i += swarm.parallelism) {
    chunks.push(swarm.agents.slice(i, i + swarm.parallelism));
  }
  for (const chunk of chunks) {
    const chunkResults = await Promise.all(chunk.map(runAgent));
    results.push(...chunkResults);
  }
  return results;
}

/**
 * Fan-out task to multiple swarms, fan-in results.
 * @param {string[]} swarms
 * @param {any} task
 * @param {Record<string, (task: any) => Promise<any>>} context
 * @returns {Promise<Record<string, Array<any>>>}
 */
export async function coordinateSwarms(swarms, task, context = {}) {
  const tasks = swarms.map(async name => {
    try {
      const results = await runSwarm(name, task, context);
      return { swarm: name, results };
    } catch (err) {
      return { swarm: name, results: [], error: err.message };
    }
  });
  const all = await Promise.all(tasks);
  return Object.fromEntries(all.map(r => [r.swarm, r.results]));
}

/**
 * Return current status of all swarms.
 * @returns {Record<string, { active: number, completed: number, errors: number }>}
 */
export function getSwarmStatus() {
  return { ...Object.fromEntries(Object.keys(SWARMS).map(k => [k, _status[k] ?? { active: 0, completed: 0, errors: 0 }])), ..._customSwarms };
}

/**
 * Select swarms and agents based on spec complexity.
 * @param {{ estimatedComplexity?: string, type?: string }} spec
 * @returns {{ swarms: string[], agents: string[] }}
 */
export async function assembleTeam(spec = {}) {
  const complexity = spec.estimatedComplexity ?? 'medium';
  const type       = spec.type ?? 'brief';

  const selectedSwarms = ['orchestration', 'engineering', 'review'];
  if (complexity === 'high')         selectedSwarms.push('operations', 'data', 'product');
  if (type === 'openapi')            selectedSwarms.push('product');
  if (complexity !== 'low')          selectedSwarms.push('operations');

  const unique = [...new Set(selectedSwarms)];
  const agents = unique.flatMap(s => (SWARMS[s] ?? _customSwarms[s])?.agents ?? []);
  return { swarms: unique, agents: [...new Set(agents)] };
}

export default { createSwarm, runSwarm, coordinateSwarms, getSwarmStatus, assembleTeam, SWARMS };
