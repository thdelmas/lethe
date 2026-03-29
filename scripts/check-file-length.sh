#!/usr/bin/env bash
# Check that no tracked source file exceeds the line limit.
# Usage: scripts/check-file-length.sh [MAX_LINES]
set -euo pipefail

MAX_LINES="${1:-500}"
FAILED=0

while IFS= read -r file; do
    case "$file" in
        *.min.js|*.min.css|*.lock|*.sum|package-lock.json|yarn.lock) continue ;;
        .venv/*|node_modules/*|vendor/*|__pycache__/*) continue ;;
        *.img|*.bin|*.zip|*.tar*|*.pyc|*.png) continue ;;
    esac

    case "$file" in
        *.py|*.sh|*.yml|*.yaml|*.conf|*.html|*.css|*.js|*.json|*.toml) ;;
        *) continue ;;
    esac

    lines=$(wc -l < "$file" 2>/dev/null || echo 0)
    if [ "$lines" -gt "$MAX_LINES" ]; then
        echo "FAIL: $file has $lines lines (limit: $MAX_LINES)"
        FAILED=1
    fi
done < <(git ls-files 2>/dev/null)

if [ "$FAILED" -eq 1 ]; then
    echo ""
    echo "Files above exceed the $MAX_LINES-line limit."
    echo "Split them into smaller modules before committing."
    exit 1
fi

echo "OK: All source files are under $MAX_LINES lines."
