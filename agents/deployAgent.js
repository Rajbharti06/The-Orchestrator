const { execSync } = require('child_process');

/**
 * Deploy Agent
 * Handles automated deployment. Token is passed via env, never on the command line.
 */
async function deployAgent(projectPath) {
  if (process.env.MOCK === 'true') {
    return {
      success: true,
      url: 'https://mock-deploy-url.vercel.app',
      message: 'Mock deployment successful.',
    };
  }

  if (!process.env.VERCEL_TOKEN) {
    return {
      success: false,
      message: 'Deployment skipped: VERCEL_TOKEN missing in environment variables.',
      url: null,
    };
  }

  try {
    // Token is injected via env, NOT appended to the command line (avoids ps/log exposure)
    const output = execSync('npx vercel --prod --yes', {
      cwd: projectPath,
      stdio: 'pipe',
      env: {
        ...process.env,
        VERCEL_TOKEN: process.env.VERCEL_TOKEN,
      },
      timeout: 120000,
    }).toString();

    const urlMatch = output.match(/https:\/\/[a-z0-9-]+\.vercel\.app/i);
    return {
      success: true,
      url: urlMatch ? urlMatch[0] : 'Check Vercel Dashboard',
      message: 'Deployment successful!',
    };
  } catch (error) {
    console.error('Error in Deploy agent:', error.message);
    return {
      success: false,
      error: error.message,
      message: 'Deployment failed. Check your Vercel configuration.',
    };
  }
}

module.exports = { deployAgent };
