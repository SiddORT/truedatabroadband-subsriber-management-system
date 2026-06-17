---
name: Alembic revision ID length
description: alembic_version.version_num is VARCHAR(32); revision IDs longer than 32 chars cause a StringDataRightTruncation error.
---

# Alembic Revision ID Length Limit

## Rule
Keep all Alembic `revision` strings to **32 characters or fewer**.

## Why
The `alembic_version` table stores the current head in `version_num VARCHAR(32)`. A revision ID longer than 32 chars causes:
```
psycopg2.errors.StringDataRightTruncation: value too long for type character varying(32)
```

## How to apply
Use short, descriptive IDs like `0015_sub_conn_fields` (21 chars) instead of `0015_subscription_connection_fields` (36 chars). Count characters before writing the migration file.
