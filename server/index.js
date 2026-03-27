const express = require('express');
const path = require('path');
const { generateCode } = require('../orchestrator');
const emitter = require('../lib/logsEmitter');

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const clients = new Set();
app.get('/logs', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();
  res.write('retry: 1000\n\n');
  const listener = (msg) => {
    res.write(`data: ${msg}\n\n`);
  };
  emitter.on('log', listener);
  clients.add(res);
  req.on('close', () => {
    emitter.off('log', listener);
    clients.delete(res);
    res.end();
  });
});

app.post('/build', async (req, res) => {
  const { prompt, llm, hosting } = req.body || {};
  if (llm === 'groq') process.env.GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (hosting) process.env.HOSTING = hosting;
  try {
    generateCode(prompt).catch(() => {});
    res.json({ status: 'started' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const port = process.env.DASHBOARD_PORT || 5001;
app.listen(port, () => {
  emitter.emit('log', `Dashboard server listening on ${port}`);
});

