/**
 * orchestrator.js - Main pipeline coordinator
 *
 * Entry point. Runs the full 8-phase autonomous build pipeline.
 * Coordinates all agents with parallel execution, retry logic,
 * live status events, and memory persistence.
 */

import { EventEmitter } from 'events';
import { runPlanner } from './agents/plannerAgent.js';
import { runArchitect } from './agents/architectAgent.js';
import { runBackend } from './agents/backendAgent.js';
import { runUI } from './agents/uiAgent.js';
import { runQA } from './agents/qaAgent.js';
import { runFix } from './agents/fixAgent.js';
import { runApp } from './agents/runAgent.js';
import { runApiTests } from './agents/apiTesterAgent.js';
import { deploy } from './agents/hostingRouter.js';
import webSearchAgentModule from './agents/webSearchAgent.js';
import { strategyLayer } from './lib/strategyLayer.js';
import { successLearner } from './lib/successLearner.js';
import { lessonStore } from './lib/lessonStore.js';
import { memoryStore } from './lib/memoryStore.js';
import { jobQueue, registerRunner } from './lib/jobQueue.js';
import { selfHeal } from './lib/selfHeal.js';
import { apiServer } from './lib/apiServer.js';
import { startDreamCycles } from './lib/dreamCycle.js';
import { verifierLoop } from './lib/goalLoop.js';
import { selectEngine } from './lib/multiEngine.js';
import reportStore from './lib/reportStore.js';
import taskBoard from './lib/taskBoard.js';
import { ragQuery } from './lib/ragEngine.js';
import { agentFederation } from './lib/agentFederation.js';
import { assembleTeam, coordinateSwarms } from './lib/swarmCoordinator.js';
import { parseSpec } from './lib/specParser.js';
import { recordEpisode, learnSemantic, getMemoryContext } from './lib/continuityMemory.js';
import { autofixCILoop } from './lib/ciLoop.js';
import { antiSycophancyScore, consensusGate, fullReview } from './lib/antiSycophancy.js';
import { verifyPipeline, verifyOutput } from './lib/prmVerifier.js';
import { runCouncil } from './lib/councilMode.js';
import { runIntelligencePipeline, think, relate, suggest } from './lib/thinkEngine.js';
import { knowledgeGraph } from './lib/knowledgeGraph.js';
import { ontologyEngine } from './lib/ontologyEngine.js';
import { causalEngine } from './lib/causalEngine.js';
import { temporalReasoner } from './lib/temporalReasoner.js';

export const orchestratorEvents = new EventEmitter();

/** @type {Map<string, {phase: string, progress: number, cancelled: boolean}>} */
const buildState = new Map();

/**
 * Log an event for a build — emits to SSE, WebSocket, and console.
 * @param {string} jobId
 * @param {string} phase
 * @param {string} message
 * @param {'info'|'success'|'error'|'warn'} [level]
 */
function log(jobId, phase, message, level = 'info') {
  const entry = { jobId, phase, message, level, timestamp: new Date().toISOString() };
  orchestratorEvents.emit('log', entry);
  jobQueue.appendLog(jobId, `[${phase}] ${message}`);

  if (process.env.MOCK !== 'true') {
    const prefix = { info: '│', success: '✓', error: '✗', warn: '⚠' }[level] || '│';
    // Use process.stdout to avoid any logging framework dependency
    process.stdout.write(`  ${prefix} [${phase}] ${message}\n`);
  }
}

/**
 * Run the full build pipeline for a job.
 * @param {Object} job - Job from queue
 * @returns {Promise<Object>} Build result
 */
async function runBuildPipeline(job) {
  const { id: jobId, prompt, options = {} } = job;
  const startTime = Date.now();
  const engine = selectEngine(options.taskType || 'planning', options.engine);

  buildState.set(jobId, { phase: 'initializing', progress: 0, cancelled: false });

  const checkCancelled = () => {
    const state = buildState.get(jobId);
    if (state?.cancelled) throw new Error('Build cancelled by user');
  };

  const sharedContext = {};

  try {
    // ── RAG: Inject relevant memory context ───────────────────────────
    try {
      const ragCtx = await ragQuery(prompt, { topK: 5, namespace: 'all' });
      if (ragCtx.confidence > 0.5) {
        sharedContext.ragContext = ragCtx.context;
        log(jobId, 'memory', `RAG: ${ragCtx.sources.length} relevant memories (confidence: ${ragCtx.confidence.toFixed(2)})`, 'info');
      }
    } catch { /* non-critical */ }

    // ── Intelligence Pipeline: THINK→RELATE→SUGGEST→EXECUTE→PRESENT ──
    if (options.intelligence !== false) {
      try {
        log(jobId, 'intel', 'Running intelligence pipeline (THINK→RELATE→SUGGEST→EXECUTE→PRESENT)...');

        // KG context from prior knowledge
        const kgCtx = await knowledgeGraph.queryKG(prompt, 6);
        if (kgCtx.context) {
          sharedContext.kgContext = kgCtx.context;
          log(jobId, 'intel', `KG: ${kgCtx.triples.length} relevant facts retrieved (PPR)`, 'info');
        }

        // Extract causal relationships from the prompt
        await causalEngine.extractCausalGraph(prompt, jobId);

        // Full intelligence pipeline (think + relate + suggest)
        const intel = await runIntelligencePipeline(
          prompt,
          [sharedContext.ragContext, sharedContext.kgContext].filter(Boolean).join('\n\n'),
          { skipExecute: true, skipPresent: true } // skip execute/present here — done post-build
        );

        sharedContext.intelligence = intel;

        // Store entities in ontology for future searchAround queries
        if (intel.relate?.entities?.length > 0) {
          for (const entity of intel.relate.entities) {
            ontologyEngine.addEntity({
              name: entity.name || entity,
              type: entity.type || 'concept',
              properties: entity.properties || {},
              confidence: entity.confidence || 0.7,
              source: jobId,
            });
          }
        }

        // Log top hypothesis
        const topHyp = intel.suggest?.hypotheses?.[0];
        if (topHyp) {
          log(jobId, 'intel', `Top hypothesis: ${topHyp.hypothesis?.slice(0, 80)} (conf: ${((topHyp.confidence || 0) * 100).toFixed(0)}%)`, 'info');
        }

        // Record temporal event for this build
        temporalReasoner.addEvent('build', `Build initiated: ${prompt.slice(0, 80)}`, {
          entities: intel.relate?.entities?.map(e => e.name || e) ?? [],
          severity: 'low',
          source: jobId,
        });

        log(jobId, 'intel', `Intelligence ready — reasoning depth: ${intel.think?.nodes ?? 0} nodes`, 'success');
      } catch (e) {
        log(jobId, 'intel', `Intelligence pipeline: ${e.message?.slice(0, 60)}`, 'warn');
      }
    }

    // ── Phase 0: Strategy ──────────────────────────────────────────────
    log(jobId, 'strategy', `Engine: ${engine.name || 'claude'} | Analyzing goal complexity...`);
    const strategy = await strategyLayer.decomposeGoal(prompt);
    sharedContext.strategy = strategy;
    log(jobId, 'strategy', `Complexity: ${strategy.complexity}, phases: ${strategy.phases.length}`, 'success');

    buildState.get(jobId).phase = 'planning';
    buildState.get(jobId).progress = 5;
    checkCancelled();

    // ── Phase 1: Planning ──────────────────────────────────────────────
    log(jobId, 'plan', 'Detecting stack and creating build plan...');
    const plan = await runPlanner(prompt, sharedContext);
    sharedContext.plan = plan;
    const stackStr = Object.entries(plan.stack || {})
      .filter(([, v]) => v && v !== 'none')
      .map(([k, v]) => `${k}:${v}`)
      .join(' ');
    log(jobId, 'plan', `Stack: ${stackStr}`, 'success');

    // Assemble swarm based on complexity
    try {
      const swarmTeam = await assembleTeam({ complexity: strategy.complexity, plan });
      sharedContext.swarmTeam = swarmTeam;
      log(jobId, 'swarm', `Team: ${swarmTeam.swarms.join(', ')} (${swarmTeam.agents.length} agents)`, 'info');
    } catch { /* non-critical */ }

    buildState.get(jobId).phase = 'architecture';
    buildState.get(jobId).progress = 15;
    checkCancelled();

    // ── Phase 2: Architecture (+ Council validation for complex builds) ──
    log(jobId, 'arch', 'Designing file structure, API contracts, DB schema...');
    const architecture = await runArchitect(prompt, plan, sharedContext);
    sharedContext.architecture = architecture;
    const endpointCount = (architecture.endpoints || []).length;
    const fileCount = Object.keys(architecture.fileStructure || {}).length;
    log(jobId, 'arch', `${fileCount} files, ${endpointCount} endpoints designed`, 'success');

    // Council validation for HIGH complexity builds only (avoid overhead on simple builds)
    if (strategy.complexity === 'high' || strategy.complexity === 'very-high') {
      try {
        const councilResult = await runCouncil({
          question: `Validate this architecture for: "${prompt}"\nStack: ${stackStr}\nEndpoints: ${endpointCount}\nFiles: ${fileCount}`,
          experts: 3,
          fast: false,
        });
        if (councilResult.synthesis.requiresHumanReview) {
          log(jobId, 'council', `⚠ Architecture review flagged: ${councilResult.synthesis.recommendation?.slice(0, 80)}`, 'warn');
        } else {
          log(jobId, 'council', `Architecture validated (confidence: ${(councilResult.synthesis.confidence * 100).toFixed(0)}%, diversity: ${(councilResult.diversity * 100).toFixed(0)}%)`, 'success');
        }
        sharedContext.councilResult = councilResult;
      } catch { /* council is advisory */ }
    }

    buildState.get(jobId).phase = 'generating';
    buildState.get(jobId).progress = 25;
    checkCancelled();

    // ── Phase 3+4: Backend & UI (parallel) ────────────────────────────
    log(jobId, 'codegen', 'Generating backend and frontend in parallel...');
    const [backendFiles, uiFiles] = await Promise.all([
      runBackend(prompt, plan, architecture, sharedContext),
      runUI(prompt, plan, architecture, sharedContext),
    ]);

    sharedContext.files = { ...backendFiles, ...uiFiles };
    const totalFiles = Object.keys(sharedContext.files).length;
    log(jobId, 'codegen', `Generated ${totalFiles} files`, 'success');

    buildState.get(jobId).phase = 'qa';
    buildState.get(jobId).progress = 55;
    checkCancelled();

    // ── Phase 5: QA (PRM step-verification + fix loop) ────────────────────
    let qaReport;
    let fixAttempts = 0;
    const MAX_FIX_ATTEMPTS = 3;

    // PRM step-wise verification before entering QA loop
    try {
      const prmResult = await verifyPipeline({
        goal: prompt,
        steps: [
          { step: 'Planning', output: JSON.stringify(plan).slice(0, 800) },
          { step: 'Architecture', output: JSON.stringify(architecture).slice(0, 800) },
          { step: 'Code generation', output: `${Object.keys(sharedContext.files || {}).length} files generated` },
        ],
        threshold: 0.5,
      });
      if (!prmResult.passed) {
        log(jobId, 'prm', `Step verification failed at step ${(prmResult.firstFail?.step ?? 0) + 1}: ${prmResult.firstFail?.reasoning?.slice(0, 80)}`, 'warn');
      } else {
        log(jobId, 'prm', `Pipeline steps verified (avg score: ${(prmResult.avgScore * 100).toFixed(0)}%)`, 'success');
      }
    } catch { /* PRM is advisory */ }

    while (fixAttempts <= MAX_FIX_ATTEMPTS) {
      log(jobId, 'qa', `QA audit (attempt ${fixAttempts + 1})...`);
      qaReport = await runQA(sharedContext.files, architecture, sharedContext);

      if (qaReport.passed || fixAttempts >= MAX_FIX_ATTEMPTS) break;

      // Search for solutions to unknown errors
      const allIssues = [...(qaReport.critical || []), ...(qaReport.high || [])];
      if (allIssues.length > 0) {
        log(jobId, 'fix', `Fixing ${allIssues.length} issue(s)...`);

        // Web search for critical unknown errors
        if (qaReport.critical?.length > 0) {
          try {
            const solutions = await webSearchAgentModule.analyzeErrors(qaReport.critical.slice(0, 2), { stack: plan.stack });
            if (solutions.length > 0) {
              solutions.forEach((s) => lessonStore.addLesson({
                issue: s.error,
                cause: 'Code generation error',
                fix: s.solution,
                stack: `${plan.stack?.backend}+${plan.stack?.frontend}`,
                tags: ['fix', 'auto'],
              }));
            }
          } catch { /* non-critical */ }
        }

        const fixResult = await runFix(sharedContext.files, qaReport, plan, sharedContext);
        sharedContext.files = fixResult.files;
        log(jobId, 'fix', `Applied ${fixResult.fixes.length} fix(es)`, fixResult.success ? 'success' : 'warn');
      }

      fixAttempts++;
      checkCancelled();
    }

    sharedContext.qaReport = qaReport;
    log(jobId, 'qa', `Score: ${qaReport.score}/100${qaReport.passed ? '' : ' (partial issues remain)'}`,
      qaReport.passed ? 'success' : 'warn');

    buildState.get(jobId).phase = 'running';
    buildState.get(jobId).progress = 75;
    checkCancelled();

    // ── Phase 6: Run ──────────────────────────────────────────────────
    log(jobId, 'run', 'Booting application...');
    const runResult = await runApp(sharedContext.files, plan, sharedContext);
    sharedContext.runResult = runResult;
    log(jobId, 'run', runResult.success
      ? `App on port ${runResult.port}`
      : `Startup issues: ${runResult.errors[0]}`,
      runResult.success ? 'success' : 'warn');

    buildState.get(jobId).phase = 'testing';
    buildState.get(jobId).progress = 85;
    checkCancelled();

    // ── Phase 7: API Tests ────────────────────────────────────────────
    log(jobId, 'test', `Testing ${(architecture.endpoints || []).length} endpoints...`);
    const testResults = await runApiTests(runResult.url, architecture.endpoints || [], {
      mock: runResult.simulated,
    });
    sharedContext.testResults = testResults;
    log(jobId, 'test', `${testResults.passed}/${testResults.total} endpoints passed`,
      testResults.passRate >= 0.8 ? 'success' : 'warn');

    buildState.get(jobId).phase = 'deploying';
    buildState.get(jobId).progress = 92;
    checkCancelled();

    // ── Phase 8: Deploy (optional) ────────────────────────────────────
    let deployResult = null;
    if (options.deploy) {
      log(jobId, 'deploy', `Deploying to ${options.platform || 'railway'}...`);
      deployResult = await deploy(sharedContext.files, plan, { platform: options.platform });
      log(jobId, 'deploy', `Deploy config generated for ${deployResult.platform}`, 'success');
    }

    // ── Success: record and learn ─────────────────────────────────────
    const durationMs = Date.now() - startTime;
    const outcome = qaReport.passed && testResults.passRate >= 0.8 ? 'success' : 'partial';

    successLearner.extractFromBuild({
      prompt,
      stack: `${plan.stack?.backend}+${plan.stack?.frontend}`,
      qaScore: qaReport.score,
      testPassRate: testResults.passRate,
      phases: ['plan', 'arch', 'backend', 'ui', 'qa', 'fix', 'run', 'test'],
      architecture,
    });

    memoryStore.recordBuild({
      prompt,
      stack: `${plan.stack?.backend}+${plan.stack?.frontend}`,
      outcome,
      qaScore: qaReport.score,
      testPassRate: testResults.passRate,
      phases: ['plan', 'arch', 'codegen', 'qa', 'run', 'test'],
      deployUrl: deployResult?.url || '',
      durationMs,
    });

    buildState.get(jobId).phase = 'completed';
    buildState.get(jobId).progress = 100;

    // Save versioned reports
    const buildVersion = `0.${memoryStore.getStats().total}.0`;
    reportStore.saveReport(buildVersion, 'planner', `Stack: ${stackStr}\nComplexity: ${strategy.complexity}`);
    reportStore.saveReport(buildVersion, 'architect', `Files: ${fileCount}, Endpoints: ${endpointCount}`);
    reportStore.saveReport(buildVersion, 'qa', `Score: ${qaReport.score}/100, Passed: ${qaReport.passed}`);
    reportStore.saveBuildSummary(buildVersion, {
      outcome,
      qaReport,
      testResults,
      durationMs: Date.now() - startTime,
      fileCount: Object.keys(sharedContext.files).length,
      plan,
    });

    // Record episodic memory for future RAG retrieval
    try {
      await recordEpisode(jobId, {
        phase: 'complete',
        outcome,
        keyFacts: [`stack: ${stackStr}`, `qa: ${qaReport.score}/100`, `files: ${Object.keys(sharedContext.files).length}`],
        duration: Date.now() - startTime,
      });
      if (outcome === 'success') {
        await learnSemantic(`${plan.stack?.backend}+${plan.stack?.frontend}`, 0.85);
      }
    } catch { /* non-critical */ }

    const result = {
      success: true,
      outcome,
      prompt,
      plan,
      architecture,
      files: sharedContext.files,
      qaReport,
      runResult,
      testResults,
      deployResult,
      durationMs,
      fileCount: Object.keys(sharedContext.files).length,
      timestamp: new Date().toISOString(),
    };

    orchestratorEvents.emit('completed', { jobId, result });
    return result;

  } catch (err) {
    buildState.get(jobId).phase = 'failed';

    const isCancelled = err.message === 'Build cancelled by user';

    if (!isCancelled) {
      log(jobId, 'error', err.message, 'error');
      lessonStore.addLesson({
        issue: `Build failed: ${err.message.slice(0, 100)}`,
        cause: 'Pipeline error',
        fix: 'Check API keys, network, and prompt clarity',
        stack: sharedContext.plan?.stack ? `${sharedContext.plan.stack.backend}+${sharedContext.plan.stack.frontend}` : 'unknown',
        tags: ['pipeline', 'error'],
      });
      memoryStore.recordBuild({
        prompt,
        stack: 'unknown',
        outcome: 'failure',
        qaScore: 0,
        testPassRate: 0,
        phases: [],
        deployUrl: '',
        durationMs: Date.now() - startTime,
      });
    }

    orchestratorEvents.emit('failed', { jobId, error: err.message });
    throw err;
  } finally {
    buildState.delete(jobId);
  }
}

/**
 * Cancel a running build.
 * @param {string} jobId
 * @returns {boolean}
 */
export function cancelBuild(jobId) {
  const state = buildState.get(jobId);
  if (state) {
    state.cancelled = true;
    return true;
  }
  return jobQueue.cancelJob(jobId);
}

/**
 * Get the current build state.
 * @param {string} jobId
 * @returns {Object|null}
 */
export function getBuildState(jobId) {
  return buildState.get(jobId) || null;
}

/**
 * Start a new build (queued).
 * @param {string} prompt
 * @param {Object} [options]
 * @returns {Object} Job object with id
 */
export function startBuild(prompt, options = {}) {
  return jobQueue.enqueue(prompt, options, options.priority || 0);
}

/**
 * Start a build from any spec format (PRD, OpenAPI, GitHub issue, one-liner).
 * @param {string} specInput - Raw spec content
 * @param {Object} [options]
 * @returns {Object} Job object with id
 */
export async function startBuildFromSpec(specInput, options = {}) {
  const spec = await parseSpec(specInput);
  const prompt = spec.description || spec.title || specInput;
  return jobQueue.enqueue(prompt, { ...options, spec, suggestedStack: spec.suggestedStack }, options.priority || 0);
}

// ── Startup ──────────────────────────────────────────────────────────────────

// Register pipeline runner
registerRunner(runBuildPipeline);

// Wire cancel function into API server
apiServer.registerOrchestratorFns({ cancelBuild, getBuildState });

// Start health monitoring
selfHeal.startPeriodicChecks(60_000);

// Start background dream cycles (memory consolidation every 2 hours)
if (process.env.MOCK !== 'true' && process.env.DISABLE_DREAMS !== 'true') {
  startDreamCycles({ intervalMs: 2 * 60 * 60 * 1000 });
}

// Start REST API + WebSocket server
const PORT = parseInt(process.env.PORT || '3000', 10);
const { startServer } = apiServer;

if (process.env.SKIP_SERVER !== 'true') {
  startServer(PORT, orchestratorEvents).then(() => {
    process.stdout.write(`\n╔═══════════════════════════════════════════╗\n`);
    process.stdout.write(`║   Orchestrator X — Autonomous Build Engine ║\n`);
    process.stdout.write(`╠═══════════════════════════════════════════╣\n`);
    process.stdout.write(`║  Dashboard: http://localhost:${PORT}          ║\n`);
    process.stdout.write(`║  API:       http://localhost:${PORT}/build     ║\n`);
    process.stdout.write(`║  WS:        ws://localhost:${PORT}/ws          ║\n`);
    process.stdout.write(`║  Mock mode: ${process.env.MOCK === 'true' ? 'ON  (no API keys needed)' : 'OFF (set MOCK=true)'}    ║\n`);
    process.stdout.write(`╚═══════════════════════════════════════════╝\n\n`);
  }).catch((err) => {
    process.stderr.write(`Failed to start server: ${err.message}\n`);
    process.exit(1);
  });
}

/**
 * Run the full THINK→RELATE→SUGGEST→EXECUTE→PRESENT intelligence pipeline
 * as a standalone operation (not tied to a build job).
 * Exposed for /think CLI command and API endpoint.
 *
 * @param {string} question - Question or situation to reason about
 * @param {string} [context]
 * @returns {Promise<Object>} Full intelligence report
 */
export async function runIntelligence(question, context = '') {
  // Enrich context from KG
  const kgCtx = await knowledgeGraph.queryKG(question, 8).catch(() => ({ context: '' }));
  const enrichedContext = [context, kgCtx.context].filter(Boolean).join('\n\n');

  const result = await runIntelligencePipeline(question, enrichedContext);

  // Save extracted entities to ontology
  for (const entity of result.relate?.entities ?? []) {
    ontologyEngine.addEntity({
      name: entity.name || entity,
      type: entity.type || 'concept',
      properties: entity.properties || {},
      confidence: entity.confidence || 0.7,
      source: 'think-cmd',
    });
  }

  // Record as temporal event
  temporalReasoner.addEvent('intelligence-query', question.slice(0, 100), {
    entities: result.relate?.entities?.map(e => e.name || e) ?? [],
    severity: 'low',
    source: 'think-cmd',
  });

  return result;
}

export { webSearchAgentModule as webSearchAgent };
export {
  think, relate, suggest,
  knowledgeGraph, ontologyEngine,
  causalEngine, temporalReasoner,
};
export default { startBuild, startBuildFromSpec, cancelBuild, getBuildState, orchestratorEvents, runIntelligence };
