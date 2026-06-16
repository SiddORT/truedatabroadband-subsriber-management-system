---
name: Alembic PgEnum migration pattern
description: How to create PostgreSQL ENUM types in Alembic migrations without duplicate-type errors.
---

## Rule
Always create PostgreSQL enum types with raw idempotent SQL, then reference them via `postgresql.ENUM(..., create_type=False)` in `op.create_table`.

## Pattern
```python
from sqlalchemy.dialects.postgresql import ENUM as PgEnum

my_enum = PgEnum("A", "B", name="my_enum", create_type=False)

def upgrade():
    conn = op.get_bind()
    conn.execute(sa.text(
        "DO $$ BEGIN CREATE TYPE my_enum AS ENUM ('A', 'B'); "
        "EXCEPTION WHEN duplicate_object THEN null; END $$;"
    ))
    op.create_table("my_table",
        sa.Column("col", my_enum, nullable=False),
        ...
    )
```

**Why:** `sa.Enum(create_type=False)` fires `_on_table_create` in this SQLAlchemy version (2.0.x) and attempts CREATE TYPE even when `create_type=False`. `postgresql.ENUM` respects the flag correctly, but the `DO $$` guard is still needed for idempotency on re-runs or partial failures.

**How to apply:** Any migration that introduces a new PostgreSQL ENUM type must use this pattern.
