#!/bin/bash

# CCI Prompt Search Hook
# Triggered on UserPromptSubmit - searches CCI for relevant knowledge
# Returns matching entries as additional context for Claude

# Read hook input from stdin
INPUT=$(cat)

# Extract the user's prompt
if command -v jq >/dev/null 2>&1; then
    PROMPT=$(echo "$INPUT" | jq -r '.prompt // empty')
else
    PROMPT=$(node -e 'const fs=require("fs");const input=fs.readFileSync(0,"utf8");try{const j=JSON.parse(input);process.stdout.write(j.prompt||"");}catch(e){}' <<< "$INPUT")
fi

# Skip if no prompt
if [ -z "$PROMPT" ]; then
    exit 0
fi

# Get the CCI repo path
CCI_REPO="${CCI_REPO:-$HOME/code/claude-collective-intelligence}"
ENTRIES_FILE="$CCI_REPO/knowledge/entries.jsonl"

# Check if entries exist
if [ ! -f "$ENTRIES_FILE" ]; then
    exit 0
fi

# Search for matching entries (case-insensitive grep on problem + tags)
# Extract keywords from prompt (simple: split on spaces, take significant words)
KEYWORDS=$(echo "$PROMPT" | tr '[:upper:]' '[:lower:]' | grep -oE '[a-z]{3,}' | sort -u | head -10)

MATCHES=""
while IFS= read -r entry; do
    # Check if any keyword matches this entry's problem, solution, or tags
    entry_lower=$(echo "$entry" | tr '[:upper:]' '[:lower:]')
    for keyword in $KEYWORDS; do
        if echo "$entry_lower" | grep -q "$keyword"; then
            # Extract problem and solution for display
            if command -v jq >/dev/null 2>&1; then
                problem=$(echo "$entry" | jq -r '.problem // empty')
                solution=$(echo "$entry" | jq -r '.solution // empty')
                timestamp=$(echo "$entry" | jq -r '.timestamp // empty')
                if [ -n "$problem" ] && [ -n "$solution" ]; then
                    MATCHES="$MATCHES
---
**CCI Match** (${timestamp%T*}): $problem
**Hint:** $solution
---"
                fi
            fi
            break
        fi
    done
done < "$ENTRIES_FILE"

# Output matches if any found
if [ -n "$MATCHES" ]; then
    echo "CCI Knowledge Base Matches:$MATCHES"
fi
