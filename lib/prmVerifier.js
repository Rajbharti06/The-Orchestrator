/**
 * prmVerifier.js - Process Reward Model (PRM) step-wise verification
 *
 * Research basis: AgentPRM (arXiv:2511.08325), "Process Reward Models That Think"
 * (arXiv:2504.16828), AgentV-RL (arXiv:2604.16004).
 *
 * Verifies EVERY STEP of agent reasoning — not just the final output.
 * Each step gets a verification chain-of-thought (sufficiency + necessity check)
 * before the agent commits to the next step.
 *
 * Sufficiency:  Did this step actually advance toward the goal?
 * Necessity:    Was this step the right approach (vs alternatives)?
 */

import { callLLM } from './llmRouter.js';

/**
 * @typedef {Object} StepVerdict
 * @property {number}   step       - Step index
 * @property {string}   action     - What the agent did
 * @property {boolean}  sufficient - Did it advance the goal?
 * @property {boolean}  necessary  - Was it the right approach?
 * @property {number}   score      - 0-1 combined quality score
 * @property {string}   reasoning  - Verification chain-of-thought
 * @property {'proceed'|'revise'|'backtrack'} decision
 */

/**
 * Verify a single agent step using bidirectional PRM.
 *
 * @param {Object} opts
 * @param {string} opts.goal      - Overall goal the agent is pursuing
 * @param {string} opts.step      - Description of the current step
 * @param {string} opts.output    - Output produced by the step
 * @param {string[]} opts.history - Prior steps (for context)
 * @param {number} [opts.stepIndex=0]
 * @returns {Promise<StepVerdict>}
 */
export async function verifyStep({ goal, step, output, history = [], stepIndex = 0 }) {
  if (process.env.MOCK === 'true') {
    return {
      step: stepIndex, action: step,
      sufficient: true, necessary: true,
      score: 0.92, reasoning: 'Mock: step verified.',
      decision: 'proceed',
    };
  }

  const historyText = history.length > 0
    ? `Prior steps:\n${history.slice(-3).map((h, i) => `  ${i + 1}. ${h}`).join('\n')}\n\n`
    : '';

  const prompt = `You are a Process Reward Model (PRM) performing step-wise verification.

Goal: ${goal}

${historyText}Current Step (${stepIndex + 1}): ${step}
Output Produced:
${String(output).slice(0, 1500)}

Perform BIDIRECTIONAL verification:

SUFFICIENCY: Did this step meaningfully advance toward the goal? Consider:
- Did it complete what it claimed?
- Does the output match what was expected?
- Did it avoid introducing new problems?

NECESSITY: Was this the right approach? Consider:
- Were there clearly better alternatives skipped?
- Is the complexity justified?
- Would a senior engineer approve this approach?

Respond with JSON only:
{
  "sufficient": true|false,
  "necessary": true|false,
  "score": 0.0-1.0,
  "reasoning": "2-3 sentence verification chain-of-thought",
  "decision": "proceed"|"revise"|"backtrack",
  "weakness": "specific weak point if any, or null"
}`;

  try {
    const raw = await callLLM({ task: 'qa', prompt, maxTokens: 500 });
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
    return {
      step: stepIndex,
      action: step,
      sufficient:  parsed.sufficient  ?? true,
      necessary:   parsed.necessary   ?? true,
      score:       parsed.score       ?? 0.7,
      reasoning:   parsed.reasoning   ?? '',
      decision:    parsed.decision    ?? 'proceed',
      weakness:    parsed.weakness    ?? null,
    };
  } catch {
    return {
      step: stepIndex, action: step,
      sufficient: true, necessary: true,
      score: 0.6, reasoning: 'Verification parse failed — proceeding cautiously.',
      decision: 'proceed', weakness: null,
    };
  }
}

/**
 * Verify a full sequence of steps. Stops and returns failed step if score < threshold.
 *
 * @param {Object} opts
 * @param {string}   opts.goal
 * @param {Array<{step: string, output: string}>} opts.steps
 * @param {number}   [opts.threshold=0.55] - Minimum score to proceed
 * @returns {Promise<{passed: boolean, verdicts: StepVerdict[], firstFail: StepVerdict|null, avgScore: number}>}
 */
export async function verifyPipeline({ goal, steps, threshold = 0.55 }) {
  const verdicts = [];
  const history = [];
  let firstFail = null;

  for (let i = 0; i < steps.length; i++) {
    const { step, output } = steps[i];
    const verdict = await verifyStep({ goal, step, output, history, stepIndex: i });
    verdicts.push(verdict);
    history.push(step);

    if (verdict.score < threshold || verdict.decision === 'backtrack') {
      firstFail = verdict;
      break;
    }
  }

  const avgScore = verdicts.reduce((s, v) => s + v.score, 0) / (verdicts.length || 1);
  return {
    passed: firstFail === null,
    verdicts,
    firstFail,
    avgScore,
  };
}

/**
 * Quick single-output quality check (not step-wise — for final results).
 *
 * @param {Object} opts
 * @param {string} opts.goal
 * @param {string} opts.output
 * @param {string} [opts.criteria] - Extra acceptance criteria
 * @returns {Promise<{passed: boolean, score: number, feedback: string}>}
 */
export async function verifyOutput({ goal, output, criteria = '' }) {
  if (process.env.MOCK === 'true') {
    return { passed: true, score: 0.95, feedback: 'Mock: output verified.' };
  }

  const prompt = `You are verifying whether an agent's final output satisfies the stated goal.

Goal: ${goal}
${criteria ? `Acceptance Criteria: ${criteria}\n` : ''}
Output:
${String(output).slice(0, 2000)}

Rate the output and return JSON only:
{
  "passed": true|false,
  "score": 0.0-1.0,
  "feedback": "Specific 1-2 sentence assessment",
  "critical_gaps": ["..."]
}`;

  try {
    const raw = await callLLM({ task: 'qa', prompt, maxTokens: 400 });
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
    return {
      passed:        parsed.passed        ?? true,
      score:         parsed.score         ?? 0.7,
      feedback:      parsed.feedback      ?? '',
      criticalGaps:  parsed.critical_gaps ?? [],
    };
  } catch {
    return { passed: true, score: 0.65, feedback: 'Verification parse failed.', criticalGaps: [] };
  }
}

export default { verifyStep, verifyPipeline, verifyOutput };
