#!/bin/sh
set -eu

DATA_DIR="${DATA_DIR:-/data}"
mkdir -p "${DATA_DIR}/models"
DATA_DIR="$(cd "${DATA_DIR}" 2>/dev/null && pwd || echo "${DATA_DIR}")"
export DATA_DIR

# Keep Prisma CLI URL aligned with the app's DATA_DIR-based database file.
export DATABASE_URL="file:${DATA_DIR}/3dmaster.db"
./node_modules/.bin/prisma migrate deploy

exec "$@"
