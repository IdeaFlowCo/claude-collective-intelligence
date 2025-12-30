# Claude Collective Intelligence (CCI) - Project Summary

## What It Is

A shared knowledge base that captures **problem→solution pairs** from Claude Code sessions. When you struggle with something, figure it out, and it works—that solution gets saved and becomes searchable for you and your team.

## Core Insight

**Don't save everything. Save the hard-won solutions.**

The valuable entries are:
- Problems that took multiple attempts (not one-shots)
- Cases where Claude's training data was stale (had to web search)
- Patterns that apply across projects (auth, APIs, configs)

Raw chat logs are noise. Consolidated insights are signal.

## Current State (v0.1 - MVP)

### Built and Working
- **Storage**: JSONL file in git repo (`knowledge/entries.jsonl`)
- **CLI**: `cci search`, `cci stats`, `cci add`, `cci sync`
- **SessionEnd Hook**: Prompts to save when exiting Claude Code
- **Skill**: Claude can search the knowledge base mid-session
- **Setup**: `node bin/cci.js setup` installs hooks + skill

### What's Naive (Needs Improvement)
- Capture logic is dumb: grabs first user message + last assistant message
- Prompts on EVERY session exit (too noisy)
- No detection of "this actually solved something"
- No consolidation of multi-turn problem-solving into clean entries

## Proposed v0.2 - Smart Capture

### Detection Logic
Only prompt to save when:
1. Session had 4+ exchanges on same issue (not a one-shot)
2. Detected failure→success pattern ("didn't work" → "that fixed it")
3. Claude had to web search (indicates stale training data)
4. User explicitly says "save this to CCI"

### Consolidation
Instead of raw transcript, save:
```json
{
  "problem": "What they were trying to do",
  "initial_approach": "What Claude tried first (that failed)",
  "solution": "What actually worked",
  "why": "Why it failed initially (e.g., API changed)",
  "tags": ["auto-generated"],
  "source_session": "link to full transcript if needed"
}
```

### Signals to Detect

**Failure signals:**
- "that didn't work"
- "still getting error"
- "same issue"
- error messages repeated

**Success signals:**
- "works!", "perfect", "thanks"
- "that fixed it"
- session ends without complaint after fix
- user moves on to different topic

**Stale training signals:**
- Claude uses WebSearch tool
- "let me look this up"
- "the API may have changed"

## Architecture

```
~/.claude/
├── settings.json          # Hook registration
├── hooks/cci-capture.sh   # SessionEnd hook
└── skills/cci/SKILL.md    # In-session search skill

~/code/claude-collective-intelligence/
├── bin/cci.js             # CLI entry point
├── src/
│   ├── capture.js         # Transcript analysis
│   ├── search.js          # Query engine
│   ├── storage.js         # JSONL read/write
│   └── schema.js          # Entry format
├── knowledge/
│   └── entries.jsonl      # The knowledge base
└── hooks/session-end.sh   # Hook script
```

## Data Flow

```
Claude Code Session
        │
        ▼
   SessionEnd Hook
        │
        ▼
   Analyze Transcript
   - Detect if worth saving
   - Extract problem/solution
   - Generate tags
        │
        ▼
   Prompt User: "Save? (y/n)"
        │
        ▼
   Append to entries.jsonl
        │
        ▼
   git commit && push (manual or via `cci sync`)
```

## User History Available

Claude Code stores full transcripts at:
```
~/.claude/projects/<project-hash>/<session-id>.jsonl
```

Current user has **2,700+ sessions** across all projects—rich source for bulk import of historical solutions.

## Open Questions

1. **Summarization**: Should we call Claude API to consolidate multi-turn threads? (adds latency + cost)
2. **Bulk import**: UX for mining historical sessions?
3. **Team sharing**: Just git, or add a sync service?
4. **Search quality**: Keyword search works, but embeddings would be better for semantic matching
5. **Privacy controls**: Per-entry visibility (private/team/public)?

## Key Files

| File | Purpose |
|------|---------|
| `src/capture.js` | Transcript parsing + extraction logic |
| `src/storage.js` | JSONL storage + search index |
| `skills/cci/SKILL.md` | Instructions for Claude to search CCI |
| `hooks/session-end.sh` | Shell hook that triggers capture |

## Success Metrics

- Entries saved per week
- Search queries that return useful results
- Time saved (qualitative: "I've solved this before")
- Stale API patterns captured
