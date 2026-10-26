#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "=== [1/3] Running Server Tests ==="
cd "${ROOT_DIR}/server"
npm test

echo "=== [2/3] Running Client Tests ==="
cd "${ROOT_DIR}/client"
npm test

echo "=== [3/3] Building Client Bundle ==="
cd "${ROOT_DIR}/client"
npm run build

echo "=== ALL VERIFICATION CHECKS PASSED ==="
