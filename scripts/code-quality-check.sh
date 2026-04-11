#!/usr/bin/env bash
# Unified code-quality script — run by pre-commit and CI.
# Usage: scripts/code-quality-check.sh [--fix]
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

FAILED=0

# ── 1. File-length check ────────────────────────────────────────────
echo "=== File-length check ==="
if ! bash scripts/check-file-length.sh; then
    FAILED=1
fi
echo ""

# ── 2. Shell lint (shellcheck) ──────────────────────────────────────
echo "=== Shell lint (shellcheck) ==="
if command -v shellcheck &>/dev/null; then
    shellcheck scripts/*.sh apply-overlays.sh || FAILED=1
else
    echo "SKIP: shellcheck not installed"
fi
echo ""

# ── 3. Python lint (ruff) — for bootanimation generator ─────────────
echo "=== Python lint (ruff) ==="
if command -v ruff &>/dev/null; then
    FIX_FLAG=""
    if [ "${1:-}" = "--fix" ]; then FIX_FLAG="--fix"; fi
    if [ -n "$FIX_FLAG" ]; then
        ruff check --fix . || FAILED=1
        ruff format . || FAILED=1
    else
        ruff check . || FAILED=1
        ruff format --check . || FAILED=1
    fi
else
    echo "SKIP: ruff not installed (pip install ruff)"
fi
echo ""

# ── 4. YAML validation ─────────────────────────────────────────────
echo "=== YAML validation ==="
if command -v python3 &>/dev/null; then
    if python3 -c "import yaml; yaml.safe_load(open('manifest.yaml'))" 2>&1; then
        echo "OK: manifest.yaml is valid YAML"
    else
        echo "FAIL: manifest.yaml is invalid"
        FAILED=1
    fi
else
    echo "SKIP: python3 not available"
fi
echo ""

# ── 5. Secret scanning ─────────────────────────────────────────────
echo "=== Secret scanning ==="
if command -v gitleaks &>/dev/null; then
    gitleaks detect --source . --no-git -q || FAILED=1
else
    SECRETS_FOUND=0
    while IFS= read -r file; do
        [ -f "$file" ] || continue
        case "$file" in
            .venv/*|__pycache__/*|*.bin|*.img|*.zip|*.png) continue ;;
        esac
        if grep -PnH '(?i)(api[_-]?key|api[_-]?secret|password|secret[_-]?key|access[_-]?token)\s*[:=]\s*["\x27][A-Za-z0-9+/=_\-]{8,}' "$file" 2>/dev/null; then
            echo "  WARN: possible secret in $file"
            SECRETS_FOUND=1
        fi
    done < <(git diff --cached --name-only --diff-filter=ACM 2>/dev/null || git ls-files)
    if [ "$SECRETS_FOUND" -eq 1 ]; then
        echo "Potential secrets detected. Review the lines above."
        FAILED=1
    else
        echo "OK: No obvious secrets found."
    fi
fi
echo ""

# ── Result ──────────────────────────────────────────────────────────
if [ "$FAILED" -eq 1 ]; then
    echo "QUALITY CHECK FAILED — fix the issues above before committing."
    exit 1
fi

echo "All quality checks passed."
