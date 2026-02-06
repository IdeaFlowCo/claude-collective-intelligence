
---
**Date:** 2026-02-05
**Problem:** How to launch parallel Codex CLI agents in tmux from Claude Code
**Context:** User asks Claude Code to "have Codex work on these tickets" or "launch Codex in a split pane"

**Solution:**
1. **Write prompts to temp files** — multiline prompts break with tmux send-keys quoting. Always `cat > /tmp/prompt.txt << 'EOF'` first.
2. **Use `$(cat ...)` to inject** — `tmux send-keys "codex --full-auto \"$(cat /tmp/prompt.txt)\"" Enter`
3. **Reasoning effort flag** — Use `-c model_reasoning_effort=high` (NOT `--effort`, that flag doesn't exist in Codex CLI v0.95+)
4. **Split pane layout** — Use `tmux split-window -h` for side-by-side, `-v` for stacked. Use `tmux join-pane` to rearrange after creation.
5. **Rearrange panes** — `tmux break-pane -s %ID -d` to extract, `tmux join-pane -s %ID -t %TARGET -h/-v` to reattach.

**Key flags:** `codex -m gpt-5.2-codex -c model_reasoning_effort=high --full-auto "$(cat /tmp/prompt.txt)"`

**Tags:** codex, tmux, multi-agent, parallel-agents, split-pane, reasoning-effort

---
**Date:** 2026-02-05
**Problem:** Mosh won't connect to HostMyApple Mac mini - "Nothing received from server on UDP port 60001"
**Context:** HostMyApple dedicated Mac mini, mosh installed via Homebrew, SSH works fine

**Root Cause:** Two firewalls blocking mosh:
1. macOS Application Firewall blocks mosh-server (user-fixable)
2. HostMyApple network firewall blocks UDP 60000-61000 (NOT user-fixable, despite their support claiming they don't block ports)

**Solution:**
1. **Whitelist mosh-server in macOS firewall:**
   - System Settings → Network → Firewall → Options → Add `/opt/homebrew/bin/mosh-server` → Allow incoming connections
   - Toggle firewall off/on to reload
2. **Use Tailscale to bypass HostMyApple's network firewall:**
   - Install Tailscale on both machines
   - Connect via Tailscale IP: `mosh user@100.x.x.x` (NOT the public IP)

**Why Tailscale works:** Tailscale tunnels through TCP (which HostMyApple allows), bypassing their UDP-blocking network firewall.

**Tags:** mosh, hostmyapple, tailscale, macos-firewall, udp, remote-server
