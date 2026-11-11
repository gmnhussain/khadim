#!/usr/bin/env sh
# Conventions §3.1: fails when a commit message carries AI attribution.
# Reads the message from the file in $1, or from stdin. Used by .githooks/commit-msg and CI.
# Matches attribution forms only: an AI Co-Authored-By trailer, a Claude-Session trailer, a line
# starting "Generated with/by <AI tool>", the Anthropic noreply address, the robot emoji. A bare tool
# name ("feat(llm): add anthropic adapter") is the subject of a change, not attribution.

# Byte-wise matching, so the emoji pattern works in any locale.
export LC_ALL=C

AI_TOOLS='claude|anthropic|copilot|cursor|openai|chatgpt|gpt-[0-9]|gemini|codex|codeium|windsurf|devin|aider|tabnine|amazon q'
PATTERN="^[[:space:]]*co-authored-by:.*(${AI_TOOLS})"
PATTERN="${PATTERN}|^[[:space:]]*claude-session:"
# Attribution lines start with "Generated", optionally after the robot emoji; mid-sentence uses
# ("fixtures regenerated with the anthropic recorder") are ordinary commit text.
GENERATED='^[[:space:]]*(🤖[[:space:]]*)?generated (with|by)'
PATTERN="${PATTERN}|${GENERATED} .*(${AI_TOOLS})"
PATTERN="${PATTERN}|${GENERATED}(.*[^a-z])?ai([^a-z]|\$)"
PATTERN="${PATTERN}|noreply@anthropic\\.com"
PATTERN="${PATTERN}|🤖"

# Drop what git strips before committing: everything below the scissors line, and comments.
message=$(sed -e '/^# -\{24\} >8 -\{24\}$/,$d' -e '/^#/d' "${1:--}")

if printf '%s\n' "$message" | grep -qiE "$PATTERN"; then
  echo "AI attribution found in the commit message (conventions §3.1):" >&2
  printf '%s\n' "$message" | grep -iE "$PATTERN" | sed 's/^/  /' >&2
  echo "Remove it and commit again." >&2
  exit 1
fi
