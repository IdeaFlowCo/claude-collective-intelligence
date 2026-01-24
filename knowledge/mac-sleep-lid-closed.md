# Mac: Keep computer awake with lid closed for long AI sessions

## Problem
Running long Claude Code sessions and want to close laptop lid, but Mac sleeps when lid closes.

- `caffeinate` only prevents idle sleep, NOT lid-close sleep
- Apps like Amphetamine require manual toggling
- `sudo pmset -a disablesleep 1` works but requires password every time

## Solution

### 1. Set up passwordless pmset (one-time)
```bash
echo 'YOUR_USERNAME ALL=(ALL) NOPASSWD: /usr/bin/pmset' | sudo tee /etc/sudoers.d/pmset
sudo chmod 0440 /etc/sudoers.d/pmset
```

**Critical:** File must be 0440 permissions or sudo ignores it.

### 2. Use the nosleep script

Full script with help, timed mode, and cleanup trap:
https://github.com/tmad4000/vibe-coding-guide/blob/main/nosleep.sh

Quick install:
```bash
curl -o /usr/local/bin/nosleep https://raw.githubusercontent.com/tmad4000/vibe-coding-guide/main/nosleep.sh
chmod +x /usr/local/bin/nosleep
```

### 3. Usage
```bash
nosleep              # 30 minutes (default)
nosleep 3600         # 1 hour
nosleep --on         # Indefinitely
nosleep --off        # Re-enable sleep
nosleep --status     # Check settings
```

## Key Features
- **Ctrl+C trap:** Sleep automatically re-enabled on interrupt
- **Timed mode:** Auto re-enables after duration
- Only grants passwordless access to pmset, not all sudo

## Reference
Full documentation: https://github.com/tmad4000/vibe-coding-guide#55-keep-mac-awake-for-long-sessions-lid-closed

## Tags
macos, sleep, pmset, caffeinate, lid-closed, long-sessions, claude-code, vibe-coding
