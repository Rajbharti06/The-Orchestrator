const { execSync } = require('child_process');

/**
 * Deploy Agent
 * Handles automated deployment of the codebase to platforms like Vercel.
 */
async function deployAgent(projectPath) {
  if (process.env.MOCK === "true") {
    return {
      success: true,
      url: "https://mock-deploy-url.vercel.app",
      message: "Mock deployment successful."
    };
  }

  if (!process.env.VERCEL_TOKEN) {
    return {
      success: false,
      message: "Deployment skipped: VERCEL_TOKEN missing in environment variables.",
      url: null
    };
  }

  try {
    // 1. Install Vercel CLI if not available (via npx)
    // 2. Run deployment
    // Note: --prod flag for production deployment, --yes to skip confirmation prompts
    const output = execSync(`npx vercel --prod --yes --token ${process.env.VERCEL_TOKEN}`, {
      cwd: projectPath,
      stdio: 'pipe'
    }).toString();

    // Extract URL from Vercel output (typically the last line starting with https://)
    const urlMatch = output.match(/https:\/\/[a-z0-9-]+\.vercel\.app/i);
    const liveUrl = urlMatch ? urlMatch[0] : "Check Vercel Dashboard";

    return {
      success: true,
      url: liveUrl,
      message: "Deployment successful!"
    };
  } catch (error) {
    console.error("Error in Deploy agent:", error.message);
    return {
      success: false,
      error: error.message,
      message: "Deployment failed. Check your Vercel configuration."
    };
  }
}

module.exports = { deployAgent };
