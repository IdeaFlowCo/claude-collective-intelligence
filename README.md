# Claude Collective Intelligence (CCI)

**A shared knowledge base for Claude Code sessions.** Capture problem-solution pairs from your Claude Code conversations and share them with your team. Stop re-solving the same problems.

## Why CCI?

- **Don't repeat yourself** - Solutions you've found once are searchable forever
- **Team knowledge sharing** - Your team's collective Claude experience, accessible to everyone
- **Outdated API detection** - Flag when Claude's training data is stale
- **Automatic context** - "What did I ask about this before?"

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
- Installs the SessionEnd hook (prompts to save when you exit Claude Code)
- Installs the CCI skill (lets Claude search the knowledge base)

### 3. Done!

Now when you finish a Claude Code session, you'll see:

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
