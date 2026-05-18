#!/usr/bin/env node
/**
 * pre-bash.js - Pre-bash hook
 *
 * Safety checks before shell commands run.
 */

const command = process.env.TOOL_INPUT_COMMAND || '';

// Block dangerous operations in the memory directory
if (command.includes('rm') && command.includes('memory/')) {
  process.stderr.write('[hook] Blocked: Cannot delete memory directory (contains learned lessons/instincts)\n');
  process.exit(2);
}

// Warn about missing MOCK flag
if (command.includes('npm start') && !process.env.MOCK && !command.includes('MOCK=')) {
  process.stderr.write('[hook] Tip: Run with MOCK=true for testing without API keys\n');
}

process.exit(0);
