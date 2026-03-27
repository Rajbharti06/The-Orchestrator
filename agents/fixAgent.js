const { chatCompletion } = require('../lib/llmRouter');

/**
 * Fix Agent
 * Takes feedback from the QA agent and applies targeted fixes to specific files.
 */
async function fixAgent(allFiles, qaResult, sharedContext) {
  if (process.env.MOCK === "true") {
    return allFiles;
  }

  const systemMessage = `
    You are a senior debugger and systems engineer.
    Your task is to fix specific issues in a codebase based on a QA report.
    
    You will receive:
    1. A list of all current files in the project.
    2. A QA report detailing the issues to fix.
    
    Return the updated content for ALL files that need modification.
    
    IMPORTANT: Return the response ONLY as a JSON object with a "files" array.
    Each object in the "files" array must have "path" and "content" fields.
    Example:
    {
      "files": [
        { "path": "src/app.js", "content": "..." },
        { "path": "src/routes/auth.js", "content": "..." }
      ]
    }
    Do not include markdown or explanations outside the JSON.
  `;

  const fileSummary = allFiles.map(f => `File: ${f.path}\nContent:\n${f.content}`).join('\n\n---\n\n');

  try {
    const content = await chatCompletion({
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: `Review these files:\n\n${fileSummary}\n\nQA Report: ${JSON.stringify(qaResult)}\n\nShared Context: ${JSON.stringify(sharedContext)}` }
      ],
      model: process.env.MODEL_NAME
    });
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0].replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ''));
      } else {
        throw new Error('Could not parse fix agent response as JSON');
      }
    }
    const updatedFiles = parsed.files;
    
    // Merge updated files back into the original allFiles array
    const fileMap = new Map(allFiles.map(f => [f.path, f]));
    updatedFiles.forEach(uf => {
      fileMap.set(uf.path, uf);
    });

    return Array.from(fileMap.values());
  } catch (error) {
    console.error("Error in Fix agent:", error.message);
    return allFiles;
  }
}

module.exports = { fixAgent };
