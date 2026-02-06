
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
