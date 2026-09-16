#!/usr/bin/env bash

set -euo pipefail

commit_message="${*:-}"

if [[ -z "$commit_message" ]]; then
  read -r -p "Commit message: " commit_message
fi

if [[ -z "$commit_message" ]]; then
  echo "Commit message cannot be empty."
  exit 1
fi

if git ls-files --error-unmatch .open-next >/dev/null 2>&1 || [[ -n "$(git ls-files '.open-next/**')" ]]; then
  echo "Refusing to commit: generated .open-next files are tracked."
  echo "Run: git rm -r --cached .open-next"
  exit 1
fi

git add -A

if git diff --cached --quiet; then
  echo "No changes to commit."
  exit 0
fi

git commit -m "$commit_message"

current_branch="$(git branch --show-current)"
git push -u origin "$current_branch"
