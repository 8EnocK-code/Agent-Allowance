#!/usr/bin/env bash
# Creates one commit per phase. Run inside the project folder after `git init`.
# Contains no credentials. Push yourself with your own authenticated git.
set -euo pipefail

git init -q 2>/dev/null || true
git checkout -q -B main

c() { git add "${@:2}" && git commit -q -m "$1" && echo "committed: $1"; }

c "chore: phase 0 - repo foundation and hardhat config" \
  .gitignore .env.example LICENSE package.json hardhat.config.js frontend/.gitkeep deployments/.gitkeep
c "feat: phase 1 - AgentVault and ProofOfThought contracts" contracts
c "test: phase 2 - vault and receipt test suites, security notes" test SECURITY.md
c "feat: phase 3 - deploy and verify scripts" scripts
c "docs: add README and phase tracker" README.md commit-phases.sh

echo
echo "Next:"
echo "  git remote add origin https://github.com/<you>/<repo>.git"
echo "  git push -u origin main"
