# Hammerspoon: eventtap that auto-locks on physical input will eat your password keystrokes

## Problem

Building a Hammerspoon "tamper detection" eventtap that calls `hs.caffeinate.lockScreen()` on physical (PID 0) input after a trust window expires — and uses `return true` to swallow the triggering event — will lock you out of your physical machine.

The bug is non-obvious until it bites you:

1. The eventtap stays active during the lock screen.
2. Password keystrokes typed at the lock screen are physical (PID 0).
3. After the trust window expires, every password keystroke triggers another `lockScreen()` call AND gets swallowed by `return true`.
4. Result: password never reaches the unlock prompt. Recovery requires SSH from another machine.

`screensDidUnlock` watcher resets the trust window — but only fires AFTER successful auth, so the grace mechanism doesn't help during password entry.

Same hazard if you are testing a lock-on-idle script and use `return true` "to swallow the triggering event so it doesn't reach the focused app."

## Solution

Bypass the eventtap entirely whenever the auth UI is visible. Don't trust a single signal — check three:

```lua
local function sessionLocked()
  local ok, p = pcall(hs.caffeinate.sessionProperties)
  p = ok and p or {}
  return p.CGSSessionScreenIsLocked == true or p.CGSSessionScreenIsLocked == 1
end

local function loginwindowFront()
  local ok, app = pcall(hs.application.frontmostApplication)
  return ok and app and app:name() == "loginwindow"
end

local function lockVisible()
  return M3.locked or sessionLocked() or loginwindowFront()
end
```

In the eventtap callback, return `false` (pass through) immediately if `lockVisible()`. Three independent signals because:
- `M3.locked` (own boolean): set proactively before calling `lockScreen()` to close the watcher race.
- `CGSSessionScreenIsLocked`: system-level state from `hs.caffeinate.sessionProperties()`.
- `loginwindow` frontmost: UI-level check.

Any one being true → keystrokes pass through.

Also:

- **Set `M3.locked = true` BEFORE calling `lockScreen()`** to close the race where `screensDidLock` fires after the lock screen has already accepted some keystrokes.
- **Self-verify**: 2 seconds after `lockScreen()`, check that the session actually locked. If not, disable the module with a sticky `hs.notify` — fail-closed.
- **Generous grace period** (5 min default) on `screensDidUnlock`, `sessionDidBecomeActive`, `screensDidWake`, and on Hammerspoon reload. Prevents reload-near-keyboard self-lockout.
- **Document the disarm command at the top of init.lua**: `ssh HOST 'touch ~/.hammerspoon-OFF; killall Hammerspoon || true'`. Discoverable in 2 seconds during a panic.
- **Hostname-gate** the module so it can't accidentally activate on another Mac (e.g., daily driver). Use `hs.host.localizedName() == "..."`.

## Reference

- Reference implementation: `tmad4000/jacob-computer-config-private` repo, `m3-server/hammerspoon-autolock.lua`, commit `da5e2c5` (and follow-ups).
- Codex was asked for a second opinion before AND after the lockout incident; the post-incident rewrite added the three-signal `lockVisible()` check and the self-verify timer.

## Tags

macos, hammerspoon, eventtap, lock-screen, lockout, keystroke-passthrough, tamper-detection, security
