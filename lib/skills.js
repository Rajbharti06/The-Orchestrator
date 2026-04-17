const fs = require('fs');
const path = require('path');

let catalog;
function loadCatalog() {
  if (!catalog) {
    const file = path.join(process.cwd(), 'lib', 'skillsCatalog.json');
    try {
      catalog = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      catalog = { skills: [] };
    }
  }
  return catalog;
}

function selectSkills(taskDescription, stack) {
  const t = (taskDescription || '').toLowerCase();
  const cat = loadCatalog();
  const selected = [];
  for (const s of (cat.skills || [])) {
    if (s.tags.some(tag => t.includes(tag))) {
      selected.push(s);
    }
  }
  if (stack && stack.backend && stack.backend.includes('FastAPI')) {
    const extra = cat.skills.find(s => s.name === '@fastapi-best-practices');
    if (extra && !selected.find(x => x.name === extra.name)) selected.push(extra);
  }
  return selected;
}

function skillsText(skills) {
  if (!skills || !skills.length) return '';
  const lines = [];
  for (const s of skills) {
    lines.push(`${s.name}:`);
    (s.guidelines || []).forEach(g => lines.push(`- ${g}`));
  }
  return `Apply the following skills and guidelines:\n${lines.join('\n')}`;
}

module.exports = { selectSkills, skillsText, loadCatalog };
