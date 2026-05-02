# Tailscale: two Macs fight over one node identity (Migration Assistant + App Store + iCloud Keychain)

## Problem

After migrating to a new Mac via Apple Migration Assistant (or having two Macs both running Mac App Store Tailscale on the same Apple ID), the two Macs **share one Tailscale node identity** and silently fight over a single connection slot. Symptoms:

- Only one of the two Macs is online in the tailnet at any time; the other shows "offline" in the admin console
- The currently-online machine sees no peers from the other Mac in `tailscale status`
- `sudo tailscale logout && sudo tailscale up` on one Mac kicks the other Mac off
- `tailscale up` returns **"duplicate node key"** error
- `tailscale status --self --json` on both Macs shows the **same NodeID** and **same NodeKey**
- The fix-loop *appears* to work (one Mac comes online), but within minutes the iCloud Keychain re-syncs identity and the collision returns

## Root Cause

Two distinct mechanisms can cause this, often together:

### Mechanism 1 — Migration Assistant clones `/Library/Tailscale/`

When you migrate Mac A → Mac B with Migration Assistant, Apple copies `/Library/<service>/` directories along with everything else. For services that store node identity at the system level, this means Mac B starts up presenting Mac A's node key. Tailscale's control plane only honors one connection per node key; whichever Mac came online most recently wins, the other silently drops.

This affects **any service** that stores identity in `/Library/<service>/`. Confirmed cases: Tailscale (`/Library/Tailscale/tailscaled.state`), Omnara (`~/.omnara/daemon.json` — actually user-level, but same pattern).

### Mechanism 2 — App Store Tailscale + iCloud Keychain

The Mac App Store / sandboxed build of Tailscale stores its node key in **iCloud-synced Keychain entries**. Two Macs on the same Apple ID running App Store Tailscale will share a single node identity *continuously* — **no Migration Assistant required**. Even after a clean `logout && up` cycle on one Mac, iCloud Keychain pushes the new key to the other within minutes and the collision returns.

This is the silent killer: once you've fixed the Mechanism 1 daemon-state clone, Mechanism 2 keeps reconverging the identity until you break the iCloud coupling.

## Diagnosis

```bash
# On both Macs, compare:
tailscale status --self --json | jq -r '"\(.Self.HostName): NodeID=\(.Self.ID) NodeKey=\(.Self.PublicKey)"'

# Same NodeID on both Macs = identity collision.
# Cross-check the Tailscale admin console at:
#   https://login.tailscale.com/admin/machines
# If it shows fewer machines than you expect, the missing ones are
# colliding with active ones, not actually disconnected.
```

Also useful — the LOCAL `tailscale status` may report `BackendState: Running` and an active IP while the control plane has actually dropped you. Trust the **admin console**, not the local CLI, when machines are colliding.

## Solution

The correct fix in this order:

### Step 1 — Decide which Mac gets the Homebrew CLI build

The Homebrew CLI build of Tailscale stores state in `/Library/Tailscale/` (per-machine, **not iCloud-synced**) and unlocks features the App Store build can't do (Tailscale SSH server, subnet routing, exit node, system daemon autostart). Pick a server-y Mac for the CLI build; daily-driver Macs can keep the App Store GUI version.

For a setup with one server + one daily driver: install CLI on the server. For two laptops where you want the GUI on both, you need to install the **open-source signed `Tailscale.app`** from `pkgs.tailscale.com/stable/` on at least one — NOT the Mac App Store version. That open-source build connects to the system daemon at `/Library/Tailscale/` and won't iCloud-sync identity.

### Step 2 — On the chosen "CLI build" Mac

```bash
# Quit + uninstall App Store Tailscale
osascript -e 'tell application "Tailscale" to quit'; sleep 1; pkill -f "Tailscale.app"
sudo rm -rf "/Applications/Tailscale.app"

# Wipe Tailscale Keychain entries from BOTH login keychain AND iCloud keychain.
# CRITICAL: open Keychain Access GUI, search "tailscale" or "ipn",
# delete from BOTH "login" and "iCloud" keychains. The iCloud one
# is the part most fixes miss — and it's the one that reconverges.

# Install Homebrew Tailscale + system daemon
brew install tailscale
sudo $(brew --prefix)/bin/tailscaled install-system-daemon

# Bring up
sudo tailscale up --ssh   # or --ssh --accept-routes for server use
```

### Step 3 — On the OTHER Mac (still on App Store, or being kept fresh)

The keychain wipe in Step 2 will propagate via iCloud and kick the other Mac off too. Sign it back in:

```bash
sudo tailscale up
# Browser OAuth, sign in as same account
```

### Step 4 — When you STILL get "duplicate node key" after Step 3

This is where most people get stuck. The control plane treats both Macs as the same registration record (same NodeID from the original clone), and `tailscale up` re-auths into the *same* slot rather than minting a new node. To force a brand-new registration:

```bash
sudo tailscale logout
sudo tailscale up --reset
```

If `--reset` still collides, nuke the local state file directly:

```bash
sudo launchctl unload /Library/LaunchDaemons/com.tailscale.tailscaled.plist
sudo rm -f /Library/Tailscale/tailscaled.state
sudo launchctl load /Library/LaunchDaemons/com.tailscale.tailscaled.plist
sudo tailscale up
```

That gives the daemon truly virgin state. The next `up` registers as a new node with a fresh NodeID.

## Verification

```bash
# Should now show TWO distinct rows with different NodeIDs and different IPs:
tailscale status

# Cross-check admin console:
open https://login.tailscale.com/admin/machines
```

Both Macs should be `Connected` simultaneously, with distinct names and IPs.

## Key Insights

1. **Migration Assistant clones `/Library/<service>/`.** For any system-level daemon that stores identity there (Tailscale, Omnara, possibly others), expect identity collisions after migration. Audit any "service that should have node identity" the day you migrate.

2. **Mac App Store Tailscale syncs identity via iCloud Keychain.** Don't run App Store Tailscale on more than one Mac per Apple ID. If you must, switch one to the Homebrew/open-source build.

3. **`tailscale up` re-auth keeps the same NodeID by default.** It re-uses the existing registration record. To force a *new* node registration after a collision, use `tailscale up --reset` or nuke `tailscaled.state` and restart the daemon.

4. **Local `tailscale status` lies during collisions.** It shows `BackendState: Running` from cached state even when the control plane has dropped the connection. Trust the admin console.

5. **Tailscale SSH server (`tailscale up --ssh`) requires the CLI build**, not the App Store sandbox build. The latter returns `500 Internal Server Error: The Tailscale SSH server does not run in sandboxed Tailscale GUI builds`.

6. **The "fix loop" trap.** With both Mechanism 1 and Mechanism 2 in play, individual fixes look like they work for ~30 seconds before iCloud reconverges. If you're cycling logout/up and it works briefly then fails, you have a continuous-sync mechanism — break it (CLI build) before doing more re-auths.

## Detection Heuristic for Future Sessions

If a user reports any of:
- "Two Macs can't both be on Tailscale at the same time"
- "Duplicate node key" from `tailscale up`
- "M5 keeps grabbing the M3 identity" (or vice versa)
- "I just migrated to a new Mac and now [VPN/mesh service] is weird"

→ Skip diagnostic loops. Ask: are both Macs running App Store Tailscale on the same Apple ID? Was Migration Assistant used recently? If yes to either, jump straight to the CLI-build solution above. Don't waste cycles on `logout && up` cycles.

## Related

- Generalizes to any cloned-daemon-state issue: `~/.claude/projects/-Users-jacobcole-code/memory/migration-assistant-daemon-state-clones.md`
- App Store + iCloud Keychain specific pattern: `~/.claude/projects/-Users-jacobcole-code/memory/tailscale-app-store-icloud-collision.md`
- This document is the unified user-facing version — covers both mechanisms and the practical fix path through both.

## Time Cost

Spent ~6 hours of debugging across 8+ tmux sessions before identifying both mechanisms and the `--reset` escape. Future occurrences should be ~10 minutes if this entry is consulted first.
