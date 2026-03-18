#!/usr/bin/env bash
# Creates symlinks so database-mcp skill is discoverable by Cursor, Claude Code, OpenCode, Antigravity
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SKILL_SRC="$ROOT/skills/database-mcp"

for dir in .cursor/skills .claude/skills .opencode/skills .agents/skills .agent/skills; do
  mkdir -p "$ROOT/$dir"
  ln -sfn "$SKILL_SRC" "$ROOT/$dir/database-mcp"
done
echo "Skill symlinks created. database-mcp is now available for Cursor, Claude Code, OpenCode, Antigravity."
