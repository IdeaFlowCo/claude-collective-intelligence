# CCI Vision

## Core Concept

Claude Collective Intelligence is a **two-way knowledge system**:

1. **Capture** (SessionEnd hook) - Save problem-solution pairs when sessions end
2. **Retrieve** (UserPromptSubmit hook) - Automatically surface relevant knowledge when prompts come in

## The Retrieval Loop

```
User types prompt
       ↓
UserPromptSubmit hook triggers
       ↓
cci-search.sh searches entries.jsonl
       ↓
Matching entries injected as context
       ↓
Claude sees hints BEFORE responding
       ↓
Claude's response is informed by collective knowledge
```

## Key Use Cases

### Stale Training Data Alerts
- Entry: "AI suggests Gemini 1.5 but this is outdated"
- When user asks about Gemini → hint appears → Claude does web research instead of guessing

### API Gotchas
- Entry: "SDK v3 renamed `client.create` → `client.responses.create`"
- When user mentions that SDK → hint appears → Claude uses correct API

### Internal Conventions
- Entry: "Use `http://svc-name.internal:8081` not public host"
- When user asks about that service → hint appears → Claude uses correct URL

### Recurring Workarounds
- Entry: "macOS permissions reset after update, re-grant in System Preferences"
- When user hits permission error → hint appears → Claude suggests the fix

## Two Hooks, Two Purposes

| Hook | File | Purpose |
|------|------|---------|
| `SessionEnd` | `cci-capture.sh` | Prompt user to save useful sessions |
| `UserPromptSubmit` | `cci-search.sh` | Search and inject relevant hints |

## Entry Format

```json
{
  "id": "unique-id",
  "timestamp": "2025-12-31T00:00:00.000Z",
  "problem": "Short description of the issue/trigger",
  "solution": "The hint/fix/workaround to surface",
  "tags": ["keyword", "matching", "tags"],
  "context": "Optional additional context",
  "source": "who added this"
}
```

## Matching Strategy

Current: Simple keyword matching
- Extract keywords from user prompt
- Match against problem, solution, tags fields
- Return all matches

Future enhancements:
- Semantic search with embeddings
- Relevance ranking
- Deduplication of similar entries

## Cross-Platform Vision

The knowledge base (`entries.jsonl`) is portable:
- Claude Code uses hooks for automatic retrieval
- Gemini CLI could read same file via GEMINI.md instructions
- Other AI tools could integrate similarly
- Web UI for browsing/editing entries

## Adding Hints

### Via Session Capture
End a session where you solved a problem → CCI prompts to save

### Manually
```bash
node bin/cci.js add
```

### Direct Edit
Add JSON line to `knowledge/entries.jsonl`

## Team Sharing

The repo is git-based:
1. Team forks/clones the repo
2. Each member's captures go to their local entries.jsonl
3. `git push` shares with team
4. `git pull` gets team's knowledge
