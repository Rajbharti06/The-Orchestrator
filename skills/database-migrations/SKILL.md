---
name: database-migrations
description: Safe database migration patterns — zero-downtime migrations, rollback strategies, backfill patterns, and migration testing for PostgreSQL, MySQL, MongoDB, and SQLite.
version: 1.0.0
triggers: [migration, migrate, alembic, prisma, db-change, schema-change, alter-table]
tags: [database, migration, postgresql, schema, safety]
---

# Database Migrations Skill

Every migration is a production risk. These patterns make them safe.

## Golden Rules

1. **Always reversible** — Every migration has a `down()` that fully reverts it
2. **Never destructive without warning** — `DROP TABLE` and `DROP COLUMN` require explicit confirmation
3. **Zero-downtime for large tables** — Phase changes over multiple deploys
4. **Test before production** — Run against a data copy first
5. **Never skip steps** — Apply migrations sequentially, never skip versions

## Zero-Downtime Patterns

### Adding a NOT NULL Column (3-Phase)

**Phase 1 (this deploy):** Add as nullable
```sql
ALTER TABLE users ADD COLUMN role VARCHAR(50);
```

**Phase 2 (backfill, background job):**
```sql
UPDATE users SET role = 'user' WHERE role IS NULL;
```

**Phase 3 (next deploy after backfill):** Add constraint
```sql
ALTER TABLE users ALTER COLUMN role SET NOT NULL;
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'user';
```

### Adding an Index Without Locking (PostgreSQL)
```sql
-- WRONG (locks table during creation):
CREATE INDEX idx_users_email ON users(email);

-- RIGHT (non-blocking):
CREATE INDEX CONCURRENTLY idx_users_email ON users(email);
```

### Renaming a Column (3-Phase)
**Phase 1:** Add new column
**Phase 2:** Write to both, read from old  
**Phase 3:** Read from new, drop old

### Removing a Column (Safe)
```python
# Alembic — remove from code first, then add migration
def upgrade():
    op.drop_column('users', 'deprecated_field')

def downgrade():
    op.add_column('users', sa.Column('deprecated_field', sa.String(255), nullable=True))
```

## Migration Templates

### Alembic (FastAPI/Python)
```python
"""Add user roles

Revision ID: abc123def456
Revises: 789xyz
Create Date: 2026-05-18
"""
from alembic import op
import sqlalchemy as sa

def upgrade() -> None:
    op.add_column('users', sa.Column('role', sa.String(50), nullable=True))
    op.execute("UPDATE users SET role = 'user' WHERE role IS NULL")
    op.alter_column('users', 'role', nullable=False, server_default='user')

def downgrade() -> None:
    op.drop_column('users', 'role')
```

### Prisma (Node.js)
```bash
npx prisma migrate dev --name add-user-roles
npx prisma migrate deploy  # production
npx prisma migrate reset   # dev reset
```

### Knex.js (Express)
```javascript
exports.up = (knex) => knex.schema.table('users', (t) => {
  t.string('role', 50).notNullable().defaultTo('user');
});
exports.down = (knex) => knex.schema.table('users', (t) => {
  t.dropColumn('role');
});
```

## Pre-Migration Checklist

- [ ] Migration is reversible
- [ ] Large table operations use CONCURRENTLY or phased approach
- [ ] Backup taken before running in production
- [ ] Migration tested on data copy
- [ ] Rollback tested (downgrade actually works)
- [ ] No data loss without explicit confirmation
