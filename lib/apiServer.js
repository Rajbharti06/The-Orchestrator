const express = require('express');
const cors = require('cors');
const { generateCode } = require('../orchestrator');
const emitter = require('./logsEmitter');

const app = express();
app.use(cors());
app.use(express.json());

let clients = [];

app.get('/logs', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const client = { res };
  clients.push(client);

  const logHandler = (data) => {
    res.write(`data: ${data}\n\n`);
  };

  emitter.on('log', logHandler);

  req.on('close', () => {
    emitter.off('log', logHandler);
    clients = clients.filter(c => c !== client);
  });
});

app.post('/build', async (req, res) => {
  const { prompt, llm, hosting } = req.body;
  if (!prompt) return res.status(400).send('Prompt is required');

  // Push preferences to environment for this run
  process.env.LLM_PROVIDER = llm || 'auto';
  process.env.HOSTING_PROVIDER = hosting || 'auto';

  res.status(202).send({ message: 'Build started' });

  try {
    await generateCode(prompt);
    emitter.emit('log', 'Build completed successfully.');
  } catch (err) {
    emitter.emit('log', `Build failed: ${err.message}`);
  }
});

const PORT = 5001;
app.listen(PORT, () => console.log(`StackForge API ready on http://localhost:${PORT}`));
