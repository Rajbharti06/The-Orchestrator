const { execSync } = require('child_process');

function detectProjectType(files) {
  const paths = (files || []).map(f => (f.path || '').toLowerCase());
  const hasPyBackend = paths.some(p => p.includes('backend/') && p.endsWith('.py'));
  const hasNodeBackend = paths.some(p => p.endsWith('app.js') || p.endsWith('index.js') || p.includes('routes/'));
  const hasFrontend = paths.some(p => p.endsWith('.jsx') || p.endsWith('.tsx') || p.includes('frontend/'));
  if ((hasPyBackend || hasNodeBackend) && hasFrontend) return 'fullstack';
  if (hasFrontend) return 'frontend';
  return 'api';
}

function deployVercel(projectPath) {
  if (!process.env.VERCEL_TOKEN) return { success: false, message: 'VERCEL_TOKEN missing', url: null };
  try {
    const out = execSync('npx vercel --prod --yes', {
      cwd: projectPath,
      stdio: 'pipe',
      env: { ...process.env, VERCEL_TOKEN: process.env.VERCEL_TOKEN },
      timeout: 120000,
    }).toString();
    const match = out.match(/https:\/\/[a-z0-9-]+\.vercel\.app/i);
    return { success: true, url: match ? match[0] : null, message: 'Deployed on Vercel' };
  } catch (e) {
    return { success: false, message: e.message, url: null };
  }
}

function deployRailway(projectPath) {
  try {
    execSync('railway up', { cwd: projectPath, stdio: 'pipe', timeout: 120000 });
    return { success: true, url: null, message: 'Deployed on Railway' };
  } catch (e) {
    return { success: false, message: 'Railway CLI not available or failed: ' + e.message, url: null };
  }
}

function deployRender(projectPath) {
  const apiKey = process.env.RENDER_API_KEY;
  const serviceId = process.env.RENDER_SERVICE_ID;
  if (!apiKey || !serviceId) {
    return { success: false, message: 'RENDER_API_KEY and RENDER_SERVICE_ID required for Render deployment', url: null };
  }
  try {
    // Trigger a deploy via Render API
    const out = execSync(
      `curl -sf -X POST https://api.render.com/v1/services/${serviceId}/deploys -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d "{}"`,
      { stdio: 'pipe', timeout: 30000 }
    ).toString();
    const data = JSON.parse(out);
    return {
      success: true,
      url: `https://dashboard.render.com/web/${serviceId}`,
      message: `Render deploy triggered (id: ${data.deploy?.id || 'unknown'})`,
    };
  } catch (e) {
    return { success: false, message: 'Render deploy failed: ' + e.message, url: null };
  }
}

function deployFly(projectPath) {
  if (!process.env.FLY_API_TOKEN) {
    return { success: false, message: 'FLY_API_TOKEN missing', url: null };
  }
  try {
    const out = execSync('flyctl deploy --remote-only', {
      cwd: projectPath,
      stdio: 'pipe',
      env: { ...process.env, FLY_API_TOKEN: process.env.FLY_API_TOKEN },
      timeout: 180000,
    }).toString();
    const match = out.match(/https:\/\/[a-z0-9-]+\.fly\.dev/i);
    return { success: true, url: match ? match[0] : null, message: 'Deployed on Fly.io' };
  } catch (e) {
    return { success: false, message: 'Fly deploy failed: ' + e.message, url: null };
  }
}

async function deployApp(projectPath, context) {
  const provider = (process.env.HOSTING || 'auto').toLowerCase();

  if (provider !== 'auto') {
    if (provider === 'vercel') return deployVercel(projectPath);
    if (provider === 'railway') return deployRailway(projectPath);
    if (provider === 'render') return deployRender(projectPath);
    if (provider === 'fly' || provider === 'flyio') return deployFly(projectPath);
    return { success: false, message: `Unknown hosting provider: ${provider}`, url: null };
  }

  // Auto-select based on project type
  const type = detectProjectType(context.files || []);
  if (type === 'frontend') return deployVercel(projectPath);
  if (type === 'fullstack') {
    // Prefer Railway for full-stack, fall back to Fly
    const r = deployRailway(projectPath);
    if (r.success) return r;
    return deployFly(projectPath);
  }
  // API-only: try Render
  return deployRender(projectPath);
}

module.exports = { deployApp, detectProjectType };
