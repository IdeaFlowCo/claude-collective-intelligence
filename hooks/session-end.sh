#!/bin/bash

# CCI Session End Hook
# Triggered when a Claude Code session ends
# Prompts user to save the session to the knowledge base

# Read hook input from stdin
INPUT=$(cat)

# Extract fields from JSON input
if command -v jq >/dev/null 2>&1; then
    TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // empty')
    SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
    CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
    REASON=$(echo "$INPUT" | jq -r '.reason // empty')
else
    PARSED=$(node -e 'const fs=require("fs");const input=fs.readFileSync(0,"utf8");try{const j=JSON.parse(input);process.stdout.write([j.transcript_path||"",j.session_id||"",j.cwd||"",j.reason||""].join("\n"));}catch(e){}' <<< "$INPUT")
    IFS=$'\n' read -r TRANSCRIPT_PATH SESSION_ID CWD REASON <<< "$PARSED"
fi

# Skip if no transcript
if [ -z "$TRANSCRIPT_PATH" ] || [ ! -f "$TRANSCRIPT_PATH" ]; then
    exit 0
fi

# Skip if session was too short (less than 4 messages typically means no real work done)
MESSAGE_COUNT=$(wc -l < "$TRANSCRIPT_PATH" | tr -d ' ')
if [ "$MESSAGE_COUNT" -lt 4 ]; then
    exit 0
fi

# Get the CCI repo path (adjust this to your installation)
CCI_REPO="${CCI_REPO:-$HOME/code/claude-collective-intelligence}"

# Check if CCI repo exists
if [ ! -d "$CCI_REPO" ]; then
    echo "CCI repo not found at $CCI_REPO"
    echo "Set CCI_REPO environment variable to your CCI installation path"
    exit 0
fi

# Run the capture script
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Claude Collective Intelligence"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd "$CCI_REPO"
node src/capture.js "$TRANSCRIPT_PATH" "$SESSION_ID" "$CWD"
