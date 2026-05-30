# Headless Mac running as a server: auto-mute and dim on lock via Hammerspoon

## Problem

A MacBook running 24/7 as a headless server (`pmset SleepDisabled=1`) keeps display brightness and audio at whatever the user last set them to. Practical impact: the machine sits in a closet at brightness 50% blasting Slack notification dings at volume 81 while nobody is in the room. Wastes power and is noisy.

The obvious fix — `brightness 0` and `osascript -e 'set volume output volume 0'` — has two failure modes:

1. **`brightness` CLI is broken on Apple Silicon.** Returns error -536870201 for both built-in and external displays. The Homebrew package is essentially unmaintained for M-series Macs.
2. **One-shot launchd jobs don't reapply.** A `RunAtLoad` LaunchAgent that mutes once at login can't react when the user unmutes during a session and then walks away.

## Solution

Plug the dim/mute logic into Hammerspoon's `hs.caffeinate.watcher`, gated to the server hostname. This gives event-driven behavior on every lock/unlock, not just at boot, and uses Hammerspoon's brightness API which works on Apple Silicon where the CLI fails.

```lua
-- Add to existing M3-gated Hammerspoon script:
local savedVolume = nil
local cw = hs.caffeinate.watcher

local function dim()
  local dev = hs.audiodevice.defaultOutputDevice()
  if not dev:muted() then savedVolume = dev:volume() end
  dev:setMuted(true)
  pcall(function() hs.brightness.set(0) end)  -- pcall: external displays often fail
end

local function restore()
  -- Brightness only. Do NOT un-mute here — see "The self-wake trap" below.
  pcall(function() hs.brightness.set(50) end)
end

-- Apply at script load (default state for headless server is dim+silent).
-- This line is easy to forget — without it the box keeps whatever volume it
-- had until the first lock event fires.
dim()

-- React to lock/unlock
hs.caffeinate.watcher.new(function(e)
  if e == cw.screensDidLock or e == cw.sessionDidResignActive then dim()
  elseif e == cw.screensDidUnlock or e == cw.sessionDidBecomeActive then restore() end
end):start()
```

## The self-wake trap (the thing that actually bit us, 2026-05-30)

The seductive version of `restore()` un-mutes and restores the saved volume on
`screensDidUnlock` **or** `sessionDidBecomeActive` **or** `screensDidWake`. On a
desktop that's fine. **On a 24/7 headless server it is wrong**, because those
"active/wake" events fire constantly on their own — the box wakes for the
network, `powerd`, `coreaudiod`, an SSH login, etc. Each self-wake runs
`restore()`, which un-mutes and slams the volume back to ~81. Net effect: the
server is audible *whenever its session is active*, which on a server is most of
the time. The diag log is a giveaway — a long `dim → restore → dim → restore`
ping-pong, ending on `restore`.

**Fix:** for an appliance, treat **muted as the permanent resting state**. `dim()`
asserts mute + volume 0; `restore()` only touches brightness; audio is never
auto-un-muted. If you're physically at the box and want sound, set it manually:

```bash
ssh server-mac 'osascript -e "set volume output volume 25 without output muted"'
```

(If you do want sound to come back for a *human*, gate it on a real
physical-presence signal — e.g. only `screensDidUnlock` after a password, not
every `sessionDidBecomeActive` — not on the wake events a server fires by itself.)

## Why this beats the alternatives

| Approach | Issue |
|---|---|
| `brightness 0` CLI | Broken on Apple Silicon (error -536870201) |
| launchd `RunAtLoad` mute | One-shot; doesn't re-mute after user unmutes mid-session |
| AppleScript brightness keystroke loop (`key code 145` × 20) | Works but only on built-in, only minimum-not-zero, no save/restore |
| `hs.brightness.set(0)` | Works on Apple Silicon for built-in; external displays usually fail (expected) |

## Verifying APIs from outside the GUI

Hammerspoon ships an `hs` CLI (enabled with `require("hs.ipc")`). Quick API smoke test over SSH:

```bash
ssh server-mac 'hs -c "return hs.brightness.get()"'         # 0..100, or 0 on error
ssh server-mac 'hs -c "return hs.audiodevice.defaultOutputDevice():volume()"'  # 0..100
```

If `hs.brightness.get()` returns `0` and the screen is clearly on, the API isn't getting through to the display — fall back to keystroke (`hs.eventtap.keyStroke({}, "F14")` repeatedly).

## Caveats

- **External monitors:** software brightness control via `hs.brightness.set` typically doesn't reach non-Apple external displays. They have to be turned off physically or via their own buttons.
- **Save state correctly:** capture the pre-mute volume *only* when the device isn't already muted, otherwise `restore()` flips back to 0.
- **Don't override user intent at unlock:** a hard `setVolume(50)` on unlock is annoying. Restore the saved level instead, or skip restore and let the user unmute manually.

## Generalization

Pattern applies to any Mac in "appliance mode" — Mac mini servers, dedicated build machines, kiosk Macs. The trigger doesn't have to be lock; it can be:
- "no SSH sessions and no GUI activity for N minutes" (poll `who` + `ioreg` HID idle time)
- "lid closed" (caffeinate watcher fires `systemDidWake`/`systemWillSleep`)
- "specific user not at keyboard" (HS eventtap on physical input)

The key idea is the same: don't try to set state once at boot — react to events with Hammerspoon, which is already running and already has the right APIs.
