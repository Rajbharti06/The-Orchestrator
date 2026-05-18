/**
 * aiProxy.js - OpenAI-compatible proxy for Cursor/Trae/IDE integration
 *
 * Exposes an OpenAI-compatible API at /v1/chat/completions.
 * Automatically enhances all prompts with memory, lessons, and instincts.
 * Configure Cursor: OpenAI API Base = http://localhost:3002/v1
 */

import express from 'express';
import cors from 'cors';
import { callLLM, getUsageStats } from './llmRouter.js';
import { promptEnhancer } from './promptEnhancer.js';

const PROXY_PORT = parseInt(process.env.PROXY_PORT || '3002', 10);

/**
 * Start the AI proxy server.
 * @returns {Promise<import('express').Application>}
 */
export function startProxy() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // OpenAI-compatible chat completions endpoint
  app.post('/v1/chat/completions', async (req, res) => {
    try {
      const { messages = [], model, max_tokens, stream } = req.body;

      // Detect task type from messages
      const lastMessage = messages[messages.length - 1]?.content || '';
      const task = detectTask(lastMessage);

      // Enhance messages with memory context
      const enhanced = promptEnhancer.enhanceMessages(messages, { task });

      // Route through Orchestrator X's LLM router
      const response = await callLLM({
        messages: enhanced,
        task,
        maxTokens: max_tokens || 4000,
      });

      const responseObj = {
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: model || 'orchestrator-x',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: response },
          finish_reason: 'stop',
        }],
        usage: {
          prompt_tokens: estimateTokens(JSON.stringify(enhanced)),
          completion_tokens: estimateTokens(response),
          total_tokens: estimateTokens(JSON.stringify(enhanced)) + estimateTokens(response),
        },
      };

      if (stream) {
        // Streaming response
        res.setHeader('Content-Type', 'text/event-stream');
        res.write(`data: ${JSON.stringify({ ...responseObj, object: 'chat.completion.chunk', choices: [{ delta: { content: response }, index: 0 }] })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      } else {
        res.json(responseObj);
      }
    } catch (err) {
      res.status(500).json({
        error: { message: err.message, type: 'internal_error', code: 'proxy_error' },
      });
    }
  });

  // List available models
  app.get('/v1/models', (_req, res) => {
    res.json({
      object: 'list',
      data: [
        { id: 'orchestrator-x', object: 'model', owned_by: 'orchestrator-x', created: 1700000000 },
        { id: 'orchestrator-x-fast', object: 'model', owned_by: 'orchestrator-x', created: 1700000000 },
      ],
    });
  });

  // Usage stats
  app.get('/v1/usage', (_req, res) => res.json(getUsageStats()));

  // Health check
  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'orchestrator-x-proxy' }));

  return new Promise((resolve) => {
    const server = app.listen(PROXY_PORT, () => {
      process.stdout.write(`  AI Proxy listening on http://localhost:${PROXY_PORT}/v1\n`);
      resolve(app);
    });
    app._server = server;
  });
}

/**
 * Detect task type from message content.
 * @param {string} content
 * @returns {string}
 */
function detectTask(content) {
  const lower = content.toLowerCase();
  if (lower.includes('plan') || lower.includes('design') || lower.includes('architecture')) return 'planning';
  if (lower.includes('test') || lower.includes('bug') || lower.includes('fix') || lower.includes('security')) return 'qa';
  if (lower.includes('deploy') || lower.includes('docker') || lower.includes('kubernetes')) return 'default';
  if (lower.includes('write') || lower.includes('generate') || lower.includes('implement') || lower.includes('code')) return 'coding';
  return 'coding';
}

/**
 * Rough token estimation (1 token ≈ 4 chars).
 * @param {string} text
 * @returns {number}
 */
function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

export const aiProxy = { startProxy };
export default aiProxy;
