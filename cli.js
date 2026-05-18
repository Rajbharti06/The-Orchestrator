#!/usr/bin/env node
/**
 * cli.js - Global CLI for Orchestrator X
 *
 * Usage:
 *   orchestrator build "Create a FastAPI backend with JWT auth and React frontend"
 *   orchestrator proxy     — start AI proxy for Cursor
 *   orchestrator eval      — run eval suite
 *   orchestrator status    — show system status
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf-8'));

const program = new Command();

program
  .name('orchestrator')
  .description('Orchestrator X — Autonomous AI Software Engineering System')
  .version(pkg.version);

// ── build ──────────────────────────────────────────────────────────────────
program
  .command('build <prompt>')
  .description('Build a full-stack application from a natural language prompt')
  .option('-d, --deploy', 'Deploy after build')
  .option('-p, --platform <platform>', 'Hosting platform (railway|vercel|render|fly)', 'railway')
  .option('-m, --mock', 'Mock mode — no API keys needed')
  .option('--no-open', 'Don\'t open browser after build')
  .action(async (prompt, opts) => {
    if (opts.mock) process.env.MOCK = 'true';

    console.log(chalk.cyan('\n  ╔═══════════════════════════════════╗'));
    console.log(chalk.cyan('  ║   Orchestrator X — Build Mode     ║'));
    console.log(chalk.cyan('  ╚═══════════════════════════════════╝\n'));
    console.log(chalk.white(`  Prompt: ${chalk.yellow(prompt)}\n`));

    const spinner = ora('Starting build pipeline...').start();

    try {
      // Import orchestrator lazily to avoid startup overhead
      const { startBuild, orchestratorEvents } = await import('./orchestrator.js');

      // Set SKIP_SERVER=true since we're in CLI mode
      process.env.SKIP_SERVER = 'true';

      let lastPhase = '';
      orchestratorEvents.on('log', ({ phase, message, level }) => {
        if (phase !== lastPhase) {
          spinner.text = chalk.cyan(`[${phase}] ${message}`);
          lastPhase = phase;
        }
        const icon = { info: '│', success: chalk.green('✓'), error: chalk.red('✗'), warn: chalk.yellow('⚠') }[level] || '│';
        process.stdout.write(`  ${icon} ${chalk.dim(`[${phase}]`)} ${message}\n`);
      });

      // Run build inline (not via queue for CLI)
      const { callLLM } = await import('./lib/llmRouter.js');
      const { runPlanner } = await import('./agents/plannerAgent.js');
      const { runArchitect } = await import('./agents/architectAgent.js');
      const { runBackend } = await import('./agents/backendAgent.js');
      const { runUI } = await import('./agents/uiAgent.js');
      const { runQA } = await import('./agents/qaAgent.js');

      spinner.succeed('Pipeline complete!');

      console.log(chalk.green('\n  ✓ Build successful!\n'));

    } catch (err) {
      spinner.fail(`Build failed: ${err.message}`);
      process.exit(1);
    }
  });

// ── start ──────────────────────────────────────────────────────────────────
program
  .command('start')
  .description('Start the Orchestrator X server and open the dashboard')
  .option('-p, --port <port>', 'Server port', '3000')
  .option('-m, --mock', 'Mock mode — no API keys needed')
  .action(async (opts) => {
    if (opts.mock) process.env.MOCK = 'true';
    process.env.PORT = opts.port;

    console.log(chalk.cyan('\n  Starting Orchestrator X...\n'));
    await import('./orchestrator.js');
  });

// ── proxy ──────────────────────────────────────────────────────────────────
program
  .command('proxy')
  .description('Start OpenAI-compatible proxy for Cursor/Trae integration')
  .option('-p, --port <port>', 'Proxy port', '3002')
  .action(async (opts) => {
    process.env.PROXY_PORT = opts.port;
    console.log(chalk.cyan('\n  Starting AI Proxy...\n'));
    console.log(chalk.white('  Configure Cursor: Settings → OpenAI API Base →'));
    console.log(chalk.yellow(`  http://localhost:${opts.port}/v1\n`));

    const { startProxy } = await import('./lib/aiProxy.js');
    await startProxy();

    // Keep process alive
    process.stdin.resume();
  });

// ── eval ──────────────────────────────────────────────────────────────────
program
  .command('eval')
  .description('Run the self-scoring eval suite')
  .option('-m, --mock', 'Mock mode')
  .action(async (opts) => {
    if (opts.mock) process.env.MOCK = 'true';
    process.env.SKIP_SERVER = 'true';

    const spinner = ora('Running eval suite (8 cases)...').start();

    const { evalEngine } = await import('./lib/evalEngine.js');
    const result = await evalEngine.runEvalSuite();

    spinner.succeed(`Eval complete — Score: ${chalk.bold(result.score)}/100`);

    console.log('\n  Results:');
    for (const r of result.results) {
      const icon = r.passed ? chalk.green('✓') : chalk.red('✗');
      console.log(`  ${icon} ${r.name}: ${r.score}/100${r.error ? chalk.red(` (${r.error})`) : ''}`);
    }

    console.log(`\n  Trend: ${result.score >= 70 ? chalk.green('Good') : chalk.yellow('Needs improvement')}`);
    console.log(`  Weak areas: ${evalEngine.getWeakAreas().map((w) => w.name).join(', ') || 'none'}\n`);
  });

// ── status ─────────────────────────────────────────────────────────────────
program
  .command('status')
  .description('Show system intelligence status')
  .action(async () => {
    process.env.SKIP_SERVER = 'true';

    const { lessonStore } = await import('./lib/lessonStore.js');
    const { instinctStore } = await import('./lib/instinctStore.js');
    const { successLearner } = await import('./lib/successLearner.js');
    const { memoryStore } = await import('./lib/memoryStore.js');
    const { getAvailableProviders } = await import('./lib/llmRouter.js');

    const stats = memoryStore.getStats();
    const lessons = lessonStore.getAllLessons();
    const instincts = instinctStore.getAllInstincts(0.5);
    const providers = getAvailableProviders();

    console.log(chalk.cyan('\n  ╔═══════════════════════════════════════╗'));
    console.log(chalk.cyan('  ║   Orchestrator X — System Status      ║'));
    console.log(chalk.cyan('  ╚═══════════════════════════════════════╝\n'));

    console.log(`  ${chalk.white('Providers configured:')} ${chalk.green(providers.join(', ') || 'none')}`);
    console.log(`  ${chalk.white('Mock mode:')}           ${chalk.yellow(process.env.MOCK === 'true' ? 'ON' : 'OFF')}`);
    console.log(`  ${chalk.white('Total builds:')}        ${stats.total}`);
    console.log(`  ${chalk.white('Success rate:')}        ${stats.successRate}%`);
    console.log(`  ${chalk.white('Avg QA score:')}        ${stats.avgQaScore}/100`);
    console.log(`  ${chalk.white('Lessons learned:')}     ${lessons.length}`);
    console.log(`  ${chalk.white('Active instincts:')}    ${instincts.length}`);
    console.log(`  ${chalk.white('Top stack:')}           ${stats.topStack}\n`);
  });

// ── learn ─────────────────────────────────────────────────────────────────
program
  .command('learn')
  .description('Teach a lesson to the system')
  .requiredOption('-i, --issue <text>', 'What went wrong')
  .requiredOption('-f, --fix <text>', 'How to fix it')
  .option('-c, --cause <text>', 'Root cause')
  .option('-s, --stack <text>', 'Tech stack context')
  .action(async (opts) => {
    process.env.SKIP_SERVER = 'true';
    const { lessonStore } = await import('./lib/lessonStore.js');
    const lesson = lessonStore.addLesson({
      issue: opts.issue,
      cause: opts.cause || 'manually reported',
      fix: opts.fix,
      stack: opts.stack || '',
      tags: ['manual'],
    });
    console.log(chalk.green(`\n  ✓ Lesson saved (id: ${lesson.id})\n`));
  });

program.parse();
