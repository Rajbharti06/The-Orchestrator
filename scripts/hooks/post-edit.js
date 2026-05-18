#!/usr/bin/env node
/**
 * post-edit.js - Post-edit hook
 *
 * Warns about common issues after file edits in the orchestrator project.
 */

const filePath = process.env.TOOL_INPUT_FILE_PATH || '';

// Warn if editing JS files in the orchestrator about ES modules
if (filePath.endsWith('.js') && !filePath.includes('node_modules')) {
  // Check for require() in ES module context
  try {
    const { readFileSync } = await import('fs');
    const content = readFileSync(filePath, 'utf-8');
    if (content.includes('require(') && !content.includes('createRequire')) {
      process.stderr.write(`[hook] Warning: ${filePath} uses require() but this project uses ES modules. Use import instead.\n`);
    }
    if (content.includes('console.log(') && !filePath.includes('test') && !filePath.includes('cli')) {
      process.stderr.write(`[hook] Note: ${filePath} contains console.log(). Use process.stdout.write() for production logging.\n`);
    }
  } catch { /* non-critical */ }
}

process.exit(0);
