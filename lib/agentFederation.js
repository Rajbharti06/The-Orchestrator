/**
 * agentFederation.js - Named Agent Communication (Ruflo/Claude Flow v3)
 *
 * Provides named agent registration and 3 coordination topologies:
 * pipeline (sequential), fanOut (parallel), supervisor (dispatched).
 */

/**
 * @typedef {(message: any, context?: any) => Promise<any>} AgentFn
 */

export class AgentFederation {
  constructor() {
    /** @type {Map<string, AgentFn>} */
    this._agents = new Map();
    /** @type {Map<string, Array<{from: string, message: any, timestamp: string}>>} */
    this._messageQueue = new Map();
  }

  /**
   * Register a named agent function.
   * @param {string} name
   * @param {AgentFn} agentFn
   */
  register(name, agentFn) {
    if (typeof agentFn !== 'function') throw new TypeError(`Agent "${name}" must be a function`);
    this._agents.set(name, agentFn);
    if (!this._messageQueue.has(name)) this._messageQueue.set(name, []);
  }

  /**
   * Route a message to a named agent.
   * @param {string} toAgent
   * @param {any} message
   * @param {string} [fromAgent='system']
   * @returns {Promise<any>}
   */
  async sendMessage(toAgent, message, fromAgent = 'system') {
    const agent = this._agents.get(toAgent);
    if (!agent) throw new Error(`Agent "${toAgent}" is not registered`);

    const envelope = { from: fromAgent, message, timestamp: new Date().toISOString() };
    this._messageQueue.get(toAgent)?.push(envelope);

    try {
      return await agent(message, { from: fromAgent });
    } catch (err) {
      throw new Error(`Agent "${toAgent}" failed: ${err.message}`);
    }
  }

  /**
   * Sequential pipeline: A→B→C, each receives the previous output.
   * @param {string[]} agents - Ordered list of agent names
   * @param {any} input - Initial input
   * @returns {Promise<any>} Final output
   */
  async pipeline(agents, input) {
    let current = input;
    for (const name of agents) {
      current = await this.sendMessage(name, current, agents[agents.indexOf(name) - 1] ?? 'system');
    }
    return current;
  }

  /**
   * Fan-out: all agents receive the same input simultaneously.
   * @param {string[]} agents
   * @param {any} input
   * @returns {Promise<Array<{agent: string, result: any, error?: string}>>}
   */
  async fanOut(agents, input) {
    const tasks = agents.map(async name => {
      try {
        const result = await this.sendMessage(name, input, 'fanout');
        return { agent: name, result };
      } catch (err) {
        return { agent: name, result: null, error: err.message };
      }
    });
    return Promise.all(tasks);
  }

  /**
   * Merge parallel fanOut results into a single synthesized output.
   * @param {Array<{agent: string, result: any}>} results
   * @param {(results: Array<any>) => Promise<any>} synthesize
   * @returns {Promise<any>}
   */
  async fanIn(results, synthesize) {
    const successful = results.filter(r => !r.error).map(r => r.result);
    if (typeof synthesize === 'function') return synthesize(successful);
    // Default: return array of results
    return successful;
  }

  /**
   * Supervisor pattern: supervisor dispatches tasks to workers and aggregates.
   * @param {string} supervisorFn - Name of the supervisor agent
   * @param {string[]} workers    - Worker agent names
   * @param {any[]} tasks         - Tasks to distribute
   * @returns {Promise<any>}
   */
  async supervisor(supervisorFn, workers, tasks) {
    const supervisor = this._agents.get(supervisorFn);
    if (!supervisor) throw new Error(`Supervisor "${supervisorFn}" is not registered`);

    // Supervisor gets workers + tasks to plan dispatch
    const dispatchPlan = await supervisor({ workers, tasks }, { role: 'supervisor' });

    // Execute dispatched tasks (round-robin if no plan returned)
    const assignments = Array.isArray(dispatchPlan)
      ? dispatchPlan
      : tasks.map((t, i) => ({ task: t, worker: workers[i % workers.length] }));

    const workerResults = await Promise.all(
      assignments.map(({ task, worker }) => this.sendMessage(worker, task, supervisorFn).catch(err => ({ error: err.message })))
    );

    // Supervisor aggregates
    return supervisor({ aggregate: workerResults }, { role: 'aggregator' });
  }

  /**
   * Return current topology: registered agents and message counts.
   * @returns {{ agents: string[], messageCounts: Record<string, number> }}
   */
  getTopology() {
    const messageCounts = {};
    for (const [name, queue] of this._messageQueue) {
      messageCounts[name] = queue.length;
    }
    return {
      agents: Array.from(this._agents.keys()),
      messageCounts,
    };
  }
}

/** Singleton federation instance */
export const agentFederation = new AgentFederation();
