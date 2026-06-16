#!/usr/bin/env bash
set -e

echo "==> Running database migrations"
python -m alembic upgrade head

echo "==> Seeding default SUPERADMIN user"
python -m app.utils.seed

echo "==> Starting API server"
exec python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
