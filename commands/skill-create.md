---
description: Create a new SKILL.md from a description or from accumulated instincts. Adds the skill to the skills/ directory and registers it in the skill loader.
argument-hint: "[skill name and description]"
---

# /skill-create — Create a New Skill

Generate a new SKILL.md from a description or graduate high-confidence instincts into a skill.

## From Description
```
/skill-create react-performance Patterns for optimizing React rendering performance
```

Creates `skills/react-performance/SKILL.md` with:
- YAML frontmatter (name, description, version, triggers, tags)
- Pattern documentation from research + lessons
- Code examples for the domain
- When-to-use guidance

## From Instincts
```
/skill-create --from-instincts fastapi-auth
```

Clusters instincts tagged `fastapi` + `auth` with confidence ≥0.8 into a new skill.

## Skill Format

Generated skills follow the standard format:
```yaml
---
name: skill-name
description: One-line description for relevance matching
version: 1.0.0
triggers: [keyword1, keyword2, keyword3]
tags: [category, domain, framework]
---
```

**After creation:** The skill is immediately available via `/orchestrator:<skill-name>` and injected into relevant agent prompts.
