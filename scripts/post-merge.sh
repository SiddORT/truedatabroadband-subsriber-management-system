#!/bin/bash
set -e

# Python packages are managed by Nix on Replit — no pip install needed.

# ── Alembic migrations ───────────────────────────────────────────────────────
echo "[post-merge] Running Alembic migrations..."
cd backend
alembic upgrade head
cd ..

# ── Node dependencies ────────────────────────────────────────────────────────
echo "[post-merge] Installing Node dependencies..."
npm install --legacy-peer-deps --silent

echo "[post-merge] Done."
