# Claude Collective Intelligence (CCI)

**A shared knowledge base for Claude Code sessions.** Capture problem-solution pairs from your Claude Code conversations and share them with your team. Stop re-solving the same problems.

## Why CCI?

- **Don't repeat yourself** - Solutions you've found once are searchable forever
- **Team knowledge sharing** - Your team's collective Claude experience, accessible to everyone
- **Outdated API detection** - Flag when Claude's training data is stale
- **Automatic context** - "What did I ask about this before?"

## User Stories

- As a developer, when I solve a multi-turn problem (e.g., updated API key format), I want CCI to prompt me to save a distilled fix.
- As a teammate, I want to search past solutions by keyword and see the exact working steps and the date it was saved.
- As a tech lead, I want only failure→success sessions captured so the knowledge base stays high-signal.
- As a developer using fast-moving APIs, I want stale-training fixes recorded so the next person avoids the same trap.
- As a privacy-conscious user, I want to edit/redact before saving anything to shared storage.
- As a new teammate, I want to find internal conventions and “the right way” by browsing CCI.
- As a power user, I want a database of known workarounds (OS/app quirks like permissions resets) so I can fix recurring issues fast.

## Acceptance Criteria (MVP)

- CCI only prompts to save when a session shows multi-turn problem solving (not one-shot).
- A saved entry includes problem, solution, timestamp, tags, and source (at minimum).
- User can edit/redact problem/solution/tags before saving.
- Entries are stored as JSONL in `knowledge/entries.jsonl` and are searchable via `cci search`.
- No raw transcripts are stored by default.
- `node bin/cci.js setup` installs a working SessionEnd hook without breaking existing hooks.

## Prioritization

**P0 (MVP)**: smart capture detection, save prompt, edit-before-save, keyword search, git-based sharing  
**P1**: bulk import + review queue, simple dedupe, project/path redaction helpers, workaround/quirk catalog  
**P2**: semantic search (embeddings) + relevance reranking  
**P3**: web UI, permissions/visibility per entry, community registry

## Concrete Use Cases

- **Stale SDK/API change** - "SDK v3 renamed `client.create` → `client.responses.create`"
- **Auth header nuance** - "Requires `Authorization: Bearer` *and* `X-Project-Id` or it 401s"
- **Env var naming mismatch** - "Repo expects `AI_API_KEY`, not `OPENAI_API_KEY`"
- **CLI version mismatch** - "Deploy fails unless `terraform` is pinned to `1.6.x`"
- **Internal service URL** - "Use `http://svc-name.internal:8081`, not the public host"
- **Permissions gotcha** - "Add `secretsmanager:GetSecretValue` or runtime fails"
- **Migration ordering** - "Run migration A before backfill or it deadlocks"
- **Webhook signature scheme** - "Use raw body, not parsed JSON, for verification"

## Quick Start (2 minutes)

### 1. Clone and install

```bash
git clone https://github.com/YOUR_ORG/claude-collective-intelligence.git ~/code/claude-collective-intelligence
cd ~/code/claude-collective-intelligence
npm install
```

### 2. Run setup

```bash
node bin/cci.js setup
```

This automatically:
- Installs the SessionEnd hook (prompts to save when a session looks save-worthy)
- Installs the CCI skill (lets Claude search the knowledge base)

### 3. Done!

Now when you finish a Claude Code session that meets the save-worthy signals, you'll see:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Claude Collective Intelligence
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Session summary:
  Messages: 24
  Tools used: Read, Edit, Bash
  Files modified: 3

--- Extracted Problem ---
How do I set up authentication with NextAuth.js and Prisma?

--- Extracted Solution ---
[Solution details...]

Save this to CCI knowledge base? (y/n): y
```

Press `y` to save, `n` to skip.

## Manual Setup (if automatic setup fails)

### Install the hook manually

Add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "~/code/claude-collective-intelligence/hooks/session-end.sh"
          }
        ]
      }
    ]
  }
}
```

### Install the skill manually

```bash
mkdir -p ~/.claude/skills/cci
cp skills/cci/SKILL.md ~/.claude/skills/cci/
```

### Set CCI_REPO (if not using default path)

Add to your shell profile (`~/.zshrc` or `~/.bashrc`):

```bash
export CCI_REPO="$HOME/code/claude-collective-intelligence"
```

## Usage

### Search the knowledge base

```bash
# From CLI
node bin/cci.js search "react hooks typescript"

# With verbose output
node bin/cci.js search -v "api authentication"
```

### Ask Claude to search

During any Claude Code session:

```
> search CCI for docker deployment patterns
> check knowledge base for authentication solutions
> what do we have in CCI about testing?
```

### View statistics

```bash
node bin/cci.js stats
```

### Manually add an entry

```bash
node bin/cci.js add
```

### Sync with team

```bash
# Pull latest + push your additions
node bin/cci.js sync

# Or manually:
git pull && git add knowledge/ && git commit -m "cci: add entries" && git push
```

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                    Claude Code Session                       │
│                                                             │
│  You: "How do I fix this TypeScript error?"                 │
│  Claude: [solves problem]                                   │
│  You: "exit"                                                │
│                                                             │
│              ↓ SessionEnd hook triggers ↓                   │
├─────────────────────────────────────────────────────────────┤
│  CCI Capture                                                │
│  ─────────────                                              │
│  • Reads conversation transcript                            │
│  • Extracts problem/solution                                │
│  • Auto-generates tags                                      │
│  • Prompts: "Save to CCI? (y/n)"                           │
└─────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  knowledge/entries.jsonl                                    │
│  ─────────────────────────                                  │
│  {"id":"abc123","timestamp":"2024-12-29T...","problem":...} │
│  {"id":"def456","timestamp":"2024-12-29T...","problem":...} │
└─────────────────────────────────────────────────────────────┘
                             │
                             ▼
                    git commit && push
                             │
                             ▼
                    Team pulls updates
```

## Team Setup

### For a new team

1. Fork this repo to your organization
2. Each team member clones and runs `node bin/cci.js setup`
3. Commit and push knowledge entries regularly

### For joining an existing team

1. Clone your team's CCI repo
2. Run `node bin/cci.js setup`
3. Run `git pull` to get latest entries

## Data Format

Entries are stored in `knowledge/entries.jsonl` (JSON Lines format):

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2024-12-29T10:30:00.000Z",
  "problem": "How do I handle async errors in Express middleware?",
  "solution": "Wrap async handlers with a catchAsync utility...",
  "tags": ["express", "javascript", "error-handling", "async"],
  "context": "Project: /Users/dev/my-api\nFiles modified: src/middleware/errors.js",
  "source": "alice",
  "sessionId": "abc123",
  "messageCount": 12,
  "toolsUsed": ["Read", "Edit", "Bash"]
}
```

## Privacy

- **You control what's saved** - Every entry requires your explicit `y` approval
- **You can edit before saving** - Modify the problem/solution text during capture
- **Project paths can be anonymized** - Edit the context field to remove sensitive paths
- **Private by default** - Only shared with those who have repo access

## Contributing

1. Use Claude Code normally
2. When you solve something useful, save it to CCI
3. `git add knowledge/ && git commit -m "cci: add entry" && git push`

## Troubleshooting

### Hook not triggering

Check that `jq` is installed:
```bash
brew install jq  # macOS
sudo apt install jq  # Ubuntu
```

Verify hook is registered:
```bash
cat ~/.claude/settings.json | jq '.hooks.SessionEnd'
```

### Search not finding entries

Ensure entries exist:
```bash
cat knowledge/entries.jsonl
```

### CCI_REPO not found

Set the environment variable:
```bash
export CCI_REPO="$HOME/code/claude-collective-intelligence"
```

## License

MIT
