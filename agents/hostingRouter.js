const { execSync } = require('child_process');

function detectProjectType(files) {
  const hasBackend = files.some(f => /src\/app\.js$|src\/routes\//.test(f.path));
  const hasFrontend = files.some(f => /src\/App\.jsx$|public\/index\.html$/.test(f.path));
  if (hasBackend && hasFrontend) return 'fullstack';
  if (hasFrontend) return 'frontend';
  return 'api';
}

function deployVercel(projectPath) {
  if (!process.env.VERCEL_TOKEN) return { success: false, message: 'VERCEL_TOKEN missing', url: null };
  try {
    const out = execSync(`npx vercel --prod --yes --token ${process.env.VERCEL_TOKEN}`, { cwd: projectPath, stdio: 'pipe' }).toString();
    const match = out.match(/https:\/\/[a-z0-9-]+\.vercel\.app/i);
    return { success: true, url: match ? match[0] : null, message: 'Deployed on Vercel' };
  } catch (e) {
    return { success: false, message: e.message, url: null };
  }
}

function deployRailway(projectPath) {
  try {
    execSync(`railway up`, { cwd: projectPath, stdio: 'pipe' });
    return { success: true, url: null, message: 'Deployed on Railway' };
  } catch (e) {
    return { success: false, message: 'Railway CLI not available', url: null };
  }
}

function deployRender(projectPath) {
  return { success: false, message: 'Render deploy not configured', url: null };
}

async function deployApp(projectPath, context) {
  const provider = process.env.HOSTING || 'auto';
  if (provider !== 'auto') {
    if (provider === 'vercel') return deployVercel(projectPath);
    if (provider === 'railway') return deployRailway(projectPath);
    if (provider === 'render') return deployRender(projectPath);
    return { success: false, message: 'Unknown hosting provider', url: null };
  }
  const type = detectProjectType(context.files || []);
  if (type === 'frontend') return deployVercel(projectPath);
  if (type === 'fullstack') return deployRailway(projectPath);
  return deployRender(projectPath);
}

module.exports = { deployApp };

