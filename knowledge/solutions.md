
---
**Date:** 2026-03-11
**Problem:** YouTube embed errors (150/152/153) in React Native WebView on iOS
**Context:** Expo SDK 55 app with react-native-webview. YouTube embeds fail with "Video unavailable" errors on iOS TestFlight. Tried: loading embed URL directly (Error 153), wrapping in HTML with iframe (Error 152-4), setting baseUrl on WebView source, adding playsinline param. All failed. Tapping YouTube's "Watch on YouTube" fallback button worked inline, suggesting a header/origin issue.

**Solution:**
Use `react-native-youtube-iframe` instead of raw WebView iframe embeds. YouTube's **July 2025 API update** enforced stricter embedder identity verification. iOS WKWebView doesn't send proper HTTP `Referer` headers on cross-origin iframe requests, so YouTube rejects the embed regardless of baseUrl or origin settings.

```bash
npx expo install react-native-youtube-iframe
```

```typescript
// For YouTube videos on native iOS/Android:
import YoutubePlayer from 'react-native-youtube-iframe';

<YoutubePlayer
  height={videoHeight}
  width={videoWidth}
  videoId={videoId}
  initialPlayerParams={{
    modestbranding: true,
    rel: false,
    start: startSec > 0 ? startSec : undefined,
  }}
  webViewProps={{
    allowsInlineMediaPlayback: true,
  }}
/>

// For web: continue using <iframe> directly (works fine)
// For non-YouTube (Facebook, etc.): WebView HTML wrapper still works
```

**Key details:**
- `react-native-youtube-iframe` wraps YouTube's IFrame Player API and handles Referer headers properly
- Works with Expo (no native module linking needed beyond react-native-webview)
- Keep using `<iframe>` for web platform — the error only affects native iOS WebView
- Error codes 150, 152, 153 are all variants of YouTube's embed restriction enforcement
- The "Watch on YouTube" fallback works because it navigates the WebView to youtube.com (proper origin)

**Tags:** react-native, expo, youtube, webview, ios, error-153, error-152, embed, react-native-youtube-iframe, wkwebview, referer

---
**Date:** 2026-02-17
**Problem:** macOS: How to programmatically type text into terminal/TUI apps reliably (Swift/CGEvent)
**Context:** Voice dictation app needs to insert text into frontmost terminal app (Terminal.app, iTerm, Warp) running TUI frameworks like ink/React. Text must appear atomically before Return/Enter is sent.

**Solution:**
Use `CGEventKeyboardSetUnicodeString` to inject multi-character strings via keyboard events. Do NOT use:
- Per-character CGEvents: Characters travel HID→Terminal→PTY→stdin one at a time. TUI may not render before Return arrives.
- Clipboard paste (Cmd+V): Race conditions — clipboard restore can clobber text before terminal reads it. Multiple rapid operations overwrite each other. Disrupts user's clipboard.
- Direct PTY write: Can't reliably find frontmost terminal's PTY file descriptor across terminal apps.
- AX text setting: Terminals don't expose shell input as a writable AXUIElement value.
- osascript: Terminal.app-specific, not cross-terminal.

**Implementation pattern (Swift):**
```swift
// Chunk text into ≤20 chars (CGEvent unicode string limit is ~20 UTF-16 units reliably)
func postUnicodeStringEvent(_ text: String) {
    let source = CGEventSource(stateID: .hidSystemState)
    var utf16 = Array(text.utf16)
    let chunkSize = 20
    for start in stride(from: 0, to: utf16.count, by: chunkSize) {
        let end = min(start + chunkSize, utf16.count)
        var chunk = Array(utf16[start..<end])
        let keyDown = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: true)
        let keyUp = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: false)
        keyDown?.keyboardSetUnicodeString(stringLength: chunk.count, unicodeString: &chunk)
        keyUp?.keyboardSetUnicodeString(stringLength: chunk.count, unicodeString: &chunk)
        keyDown?.post(tap: .cghidEventTap)
        keyUp?.post(tap: .cghidEventTap)
    }
}
```

**Key details:**
- Serialize all terminal operations on a dedicated DispatchQueue to prevent interleaving
- Wait 900ms after last text injection before sending Return (TUI needs processing time)
- Non-terminal GUI apps can still use per-character CGEvents (they're reliable for standard text fields)

**Tags:** macos, cgevent, terminal, tui, swift, unicode, keyboard-injection, voice-dictation, clipboard-race

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

---
date: 2026-03-31
problem: Otter.ai unofficial API pagination doesn't work - only returns 200 transcripts
solution: |
  The `gmchad/otterai-api` library is missing pagination support. The API returns `last_load_ts` in responses but the library never sends it back.
  
  Key findings:
  1. The correct pagination param is `modified_after` (NOT `last_load_ts` as a query param)
  2. Pass `last_load_ts` from response AND `modified_after` together for next page
  3. Use the `mtriedl/otterai-api` fork: `pip install git+https://github.com/mtriedl/otterai-api.git`
  4. The mtriedl fork adds `last_load_ts`, `modified_after`, `speech_metadata` params to `get_speeches()`
  5. Use `otid` field (NOT `speech_id`) when calling `get_speech()` to fetch full transcripts
  6. API appears to cap at ~235 transcripts regardless of pagination (may be account-tier dependent)
  7. Rate limiting kicks in around 500+ requests - use `time.sleep(1)` between pages
  8. Second `get_speeches()` call on same session returns empty - this is normal, use `modified_after` 
  
  Working pagination pattern (from mtriedl/utils/otter_sync.py):
  ```python
  speeches = []
  seen_tokens = set()
  last_load_ts = None
  while True:
      kwargs = {"modified_after": since}
      if last_load_ts is not None:
          kwargs["last_load_ts"] = last_load_ts
      result = client.get_speeches(**kwargs)
      data = result.get("data", {})
      speeches.extend(data.get("speeches", []))
      next_token = data.get("last_load_ts")
      if next_token is None or next_token in seen_tokens:
          break
      seen_tokens.add(next_token)
      last_load_ts = next_token
  ```
tags: otter, api, pagination, transcription

---
date: 2026-04-12
problem: How to orchestrate multiple Claude Code sessions working in parallel on the same project
solution: |
  Create a Claude Code skill (`~/.claude/skills/orchestrator/SKILL.md`) that turns one session into
  a coordinator that delegates work to other sessions via tmux windows. The orchestrator never does
  implementation work itself — it routes tasks, spawns new sessions, and monitors progress.

  Key patterns:
  1. **Spawn fresh sessions for unrelated work** — don't pollute an existing session's context with
     unrelated tasks. Only reuse a window if the new task is a direct continuation.
  2. **Write prompts to temp files** — multiline prompts break when sent via `tmux send-keys` with quotes.
     Always: `cat > /tmp/task.txt << 'PROMPT' ... PROMPT` then reference via `$(cat /tmp/task.txt)`.
  3. **Wrap in `bash -c '...; exec bash'`** so panes persist after the agent exits.
  4. **Ask before closing windows** — sessions accumulate hard-to-rebuild context.
  5. **Create tickets before dispatching** — use an issue tracker so work is traceable.

  Spawning pattern:
  ```bash
  cat > /tmp/task.txt << 'PROMPT'
  Your detailed task description here...
  PROMPT
  tmux new-window -t SESSION -n "task-name" \
    "bash -c 'cd /path/to/project && claude --dangerously-skip-permissions \"\$(cat /tmp/task.txt)\"; exec bash'"
  ```

  Monitoring: `tmux capture-pane -t SESSION:WINDOW -p | tail -30`

  Related tools: dmux (standardagents), CLI Agent Orchestrator (AWS Labs), ittybitty (Adam Wulf),
  Claude Code Agent Teams (Anthropic experimental). All converge on git worktrees for isolation
  when agents edit the same files — the skill above works for sequential task routing without
  worktree overhead.

  Full skill: https://github.com/tmad4000/vibe-coding-guide (orchestrator skill)
tags: claude-code, orchestrator, tmux, multi-agent, parallel-sessions, skill

---
date: 2026-04-12
problem: Need a comprehensive guide for AI-assisted "vibe coding" workflows — multi-agent orchestration, session management, keeping Mac awake, and practical patterns
solution: |
  The Vibe Coding Guide (https://github.com/tmad4000/vibe-coding-guide) is a living document
  covering practical patterns for AI-assisted software development. Provisionally rated as a
  great resource.

  Key topics covered:
  - Multi-agent orchestration with tmux
  - Session management (nosleep, caffeinate, lid-close prevention)
  - Claude Code skills and hooks
  - Mac App Store submission workflows
  - Practical patterns discovered through daily use

  Repo: https://github.com/tmad4000/vibe-coding-guide
  Author: Jacob Cole (@tmad4000)

  Status: Provisionally great — actively maintained, battle-tested patterns from real projects.
tags: vibe-coding, guide, claude-code, workflows, multi-agent, reference

---
date: 2026-04-12
problem: Need to scrape/export public Google Docs content without setting up API credentials
solution: |
  Public Google Docs can be exported directly via URL — no API key or OAuth needed:

  ```
  https://docs.google.com/document/d/{DOC_ID}/export?format=txt
  ```

  Supported formats: txt, pdf, docx, html, odt, rtf, epub

  Extract the DOC_ID from any Google Docs URL:
  ```python
  import re
  match = re.search(r'/document/d/([a-zA-Z0-9_-]+)', url)
  doc_id = match.group(1) if match else None
  ```

  For private docs (returns 401/403), fall back to indicating it's a private document
  with an external link rather than trying to scrape.

  This is simpler than Google Docs API with service accounts when docs are publicly shared.
tags: google-docs, scraping, export, api, public-documents
