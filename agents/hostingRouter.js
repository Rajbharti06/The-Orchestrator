/**
 * hostingRouter.js - Multi-platform deployment agent
 *
 * Deploys to Railway, Vercel, Render, or Fly.io based on stack and config.
 * Writes deployment config files and provides deploy commands.
 */

import { callLLM } from '../lib/llmRouter.js';

/**
 * Route to the appropriate hosting platform and generate deploy config.
 * @param {Object} files - Generated files
 * @param {Object} plan - Build plan
 * @param {Object} [opts]
 * @param {string} [opts.platform] - Force a specific platform
 * @returns {Promise<{platform: string, configFiles: Object, deployCommands: string[], url: string}>}
 */
export async function deploy(files, plan, opts = {}) {
  const stack = plan.stack || {};
  const platform = opts.platform || selectPlatform(stack);

  const configFiles = generateDeployConfig(platform, stack, files);
  const deployCommands = getDeployCommands(platform, stack);

  if (process.env.MOCK === 'true') {
    return {
      platform,
      configFiles,
      deployCommands,
      url: `https://app-${Date.now()}.${platform}.app`,
      simulated: true,
    };
  }

  // Use LLM to finalize any platform-specific config
  const config = JSON.stringify(configFiles, null, 2).slice(0, 1000);
  const notes = await callLLM({
    prompt: `Review this ${platform} deployment config for a ${stack.backend}+${stack.frontend} app and suggest any improvements:\n${config}`,
    task: 'qa',
    maxTokens: 300,
  });

  return {
    platform,
    configFiles,
    deployCommands,
    url: `https://app.${platform}.app (deploy to get real URL)`,
    notes: notes.slice(0, 200),
  };
}

/**
 * Select the best hosting platform for the stack.
 * @param {Object} stack
 * @returns {string}
 */
function selectPlatform(stack) {
  // Vercel: best for Next.js / static frontends
  if (stack.frontend === 'nextjs') return 'vercel';

  // Railway: best for full-stack with databases
  if (stack.db && stack.db !== 'none' && stack.db !== 'sqlite') return 'railway';

  // Render: good for FastAPI / Django
  if (['fastapi', 'django'].includes(stack.backend)) return 'render';

  // Fly.io: good for Go / containerized apps
  if (stack.backend === 'gin') return 'fly';

  return 'railway'; // Default
}

/**
 * Generate platform-specific deployment config files.
 * @param {string} platform
 * @param {Object} stack
 * @param {Object} files
 * @returns {Object} { filename: content }
 */
function generateDeployConfig(platform, stack, files) {
  const configs = {};

  const configs_by_platform = {
    railway: () => {
      configs['railway.toml'] = `[build]
builder = "NIXPACKS"

[deploy]
startCommand = "${getStartCommand(stack)}"
healthcheckPath = "/health"
healthcheckTimeout = 300
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3`;
    },

    vercel: () => {
      configs['vercel.json'] = JSON.stringify({
        buildCommand: stack.frontend === 'nextjs' ? 'npm run build' : 'cd frontend && npm run build',
        outputDirectory: stack.frontend === 'nextjs' ? '.next' : 'frontend/dist',
        devCommand: 'npm run dev',
        installCommand: 'npm install',
        rewrites: [{ source: '/api/(.*)', destination: `http://localhost:${stack.backend === 'fastapi' ? 8000 : 3000}/api/$1` }],
      }, null, 2);
    },

    render: () => {
      configs['render.yaml'] = `services:
  - type: web
    name: app-backend
    env: ${stack.backend === 'fastapi' ? 'python' : 'node'}
    buildCommand: ${stack.backend === 'fastapi' ? 'pip install -r requirements.txt' : 'npm install'}
    startCommand: ${getStartCommand(stack)}
    healthCheckPath: /health
    envVars:
      - key: PORT
        value: ${stack.backend === 'fastapi' ? '8000' : '3000'}
      - key: DATABASE_URL
        fromDatabase:
          name: app-db
          property: connectionString

databases:
  - name: app-db
    databaseName: app
    user: app`;
    },

    fly: () => {
      configs['fly.toml'] = `app = "orchestrator-app"
primary_region = "ord"

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = ${stack.backend === 'gin' ? 8080 : 3000}
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0

[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 256`;

      configs['Dockerfile'] = generateDockerfile(stack);
    },
  };

  configs_by_platform[platform]?.();

  // Always add a Dockerfile for portability
  if (platform !== 'fly') {
    configs['Dockerfile'] = generateDockerfile(stack);
    configs['.dockerignore'] = 'node_modules\n.env\n*.log\n__pycache__\n.git';
  }

  return configs;
}

/**
 * Generate a Dockerfile for the stack.
 * @param {Object} stack
 * @returns {string}
 */
function generateDockerfile(stack) {
  if (stack.backend === 'fastapi') {
    return `FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]`;
  }

  return `FROM node:20-alpine
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --only=production
COPY backend/ .
EXPOSE 3000
CMD ["node", "index.js"]`;
}

/**
 * Get the start command for the stack.
 * @param {Object} stack
 * @returns {string}
 */
function getStartCommand(stack) {
  const cmds = {
    fastapi: 'uvicorn main:app --host 0.0.0.0 --port $PORT',
    express: 'node index.js',
    django: 'gunicorn app.wsgi:application --bind 0.0.0.0:$PORT',
    gin: './app',
  };
  return cmds[stack.backend] || 'node index.js';
}

/**
 * Get deploy commands for the platform.
 * @param {string} platform
 * @param {Object} stack
 * @returns {string[]}
 */
function getDeployCommands(platform, stack) {
  const cmds = {
    railway: [
      'npm install -g @railway/cli',
      'railway login',
      'railway init',
      'railway up',
      'railway open',
    ],
    vercel: [
      'npm install -g vercel',
      'vercel login',
      'vercel --prod',
    ],
    render: [
      '# Connect GitHub repo at render.com',
      '# Set environment variables in Render dashboard',
      '# Deploy triggers automatically on git push',
    ],
    fly: [
      'curl -L https://fly.io/install.sh | sh',
      'fly auth login',
      'fly launch',
      'fly deploy',
    ],
  };
  return cmds[platform] || cmds.railway;
}

export default { deploy };
