/**
 * githubAgent.js - Git commit and push generated code
 *
 * Creates a proper .gitignore, writes meaningful commit messages,
 * initializes a git repo if needed, and pushes to GitHub.
 */

import { callLLM } from '../lib/llmRouter.js';

/**
 * Commit and optionally push generated code to GitHub.
 * @param {Object} files - Generated files { filename: content }
 * @param {Object} plan - Build plan
 * @param {Object} [opts]
 * @param {string} [opts.repoUrl] - GitHub repo URL
 * @param {string} [opts.branch] - Branch name (default: main)
 * @param {string} [opts.prompt] - Original build prompt (for commit message)
 * @returns {Promise<{success: boolean, commitMessage: string, commands: string[]}>}
 */
export async function commitCode(files, plan, opts = {}) {
  const stack = plan.stack || {};
  const stackStr = `${stack.backend || 'express'}+${stack.frontend || 'react'}`;

  // Generate meaningful commit message
  const commitMessage = await generateCommitMessage(opts.prompt || 'Initial build', stackStr);

  // Generate .gitignore
  const gitignore = generateGitignore(stack);

  const commands = [
    'git init',
    'git add -A',
    `git commit -m "${commitMessage}"`,
  ];

  if (opts.repoUrl) {
    commands.push(`git remote add origin ${opts.repoUrl}`);
    commands.push(`git push -u origin ${opts.branch || 'main'}`);
  }

  return {
    success: true,
    commitMessage,
    commands,
    gitignore,
    filesToCommit: Object.keys(files).length,
  };
}

/**
 * Generate a meaningful commit message.
 * @param {string} prompt
 * @param {string} stack
 * @returns {Promise<string>}
 */
async function generateCommitMessage(prompt, stack) {
  if (process.env.MOCK === 'true') {
    return `feat: initial ${stack} application build`;
  }

  try {
    const raw = await callLLM({
      prompt: `Write a git commit message (max 72 chars) for this build:
"${prompt.slice(0, 200)}"
Stack: ${stack}

Return ONLY the commit message, no quotes, no explanation.`,
      task: 'default',
      maxTokens: 100,
    });

    const msg = raw.trim().replace(/^["']|["']$/g, '').slice(0, 72);
    return msg || `feat: initial ${stack} application build`;
  } catch {
    return `feat: initial ${stack} application build`;
  }
}

/**
 * Generate .gitignore for the stack.
 * @param {Object} stack
 * @returns {string}
 */
function generateGitignore(stack) {
  const base = `# Dependencies
node_modules/
__pycache__/
*.pyc
.venv/
venv/
env/

# Environment
.env
.env.local
.env.production
*.env

# Build outputs
dist/
build/
.next/
out/
*.egg-info/

# Logs
*.log
logs/
npm-debug.log*

# Database
*.db
*.sqlite
*.sqlite3

# IDE
.vscode/settings.json
.idea/
*.swp

# OS
.DS_Store
Thumbs.db

# Orchestrator X
memory/*.json
!memory/.gitkeep`;

  const pythonExtra = `
# Python
*.pyc
.pytest_cache/
.coverage
htmlcov/`;

  const nodeExtra = `
# Node
.npm
.eslintcache
.parcel-cache`;

  let gitignore = base;
  if (['fastapi', 'django'].includes(stack.backend)) gitignore += pythonExtra;
  if (['express', 'nextjs'].includes(stack.backend) || stack.frontend) gitignore += nodeExtra;

  return gitignore;
}

export default { commitCode };
