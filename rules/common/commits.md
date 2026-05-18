# Commit Rules — Always Follow

Use Conventional Commits format for every commit.

## Format

```
<type>(<scope>): <short description>

[optional body]

[optional footer]
```

## Types

| Type | When to Use |
|------|-------------|
| `feat` | New feature added |
| `fix` | Bug fix |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `docs` | Documentation only changes |
| `test` | Adding or updating tests |
| `chore` | Build process, dependency updates, tooling |
| `perf` | Performance improvement |
| `ci` | CI/CD configuration changes |
| `security` | Security patch or hardening |
| `revert` | Reverts a previous commit |

## Rules

- First line ≤72 characters
- Use imperative mood: "add feature" not "added feature" or "adds feature"
- Scope is optional but helpful: `feat(auth): add JWT refresh`
- Body explains WHY, not WHAT (the diff shows what)
- Breaking changes: add `BREAKING CHANGE:` footer

## Examples

```
feat(api): add /api/reports endpoint for build history export

Consumers needed a way to export build history without scraping
the dashboard HTML. This adds a paginated JSON endpoint.

feat(auth): add JWT refresh token rotation

fix(queue): prevent race condition when 4+ concurrent builds start

Builds > 4 would share state due to non-atomic check-then-set
on the active build counter.

security: patch XSS in dashboard log renderer

BREAKING CHANGE: /api/v1/build response shape changed — 'files'
now returns an array of {path, content} instead of {path: content}
```

## Commit Size

- One logical change per commit
- Don't bundle unrelated changes
- OK to have multiple commits per PR
- Avoid "WIP" or "fix typo" commits — squash before merging
