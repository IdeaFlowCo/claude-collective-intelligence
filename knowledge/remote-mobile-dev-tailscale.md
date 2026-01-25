# Remote Mobile Development via Tailscale

**Date:** 2026-01-25
**Context:** Testing web apps on iPad while dev server runs on Mac

## Key Learnings

### 1. CORS Must Allow Tailscale IPs
When accessing a local dev server via Tailscale (e.g., `http://100.109.59.66:port`), CORS will block requests unless the Tailscale IP range is allowed.

**Fix:** Add `100.*` to your CORS allowed origins:
```javascript
const allowed = origin.includes('localhost') ||
                origin.includes('127.0.0.1') ||
                origin.includes('192.168.') ||  // Local network
                origin.includes('100.');        // Tailscale
```

### 2. API URLs Must Use Tailscale IP
If your frontend hardcodes `localhost` for API calls, it won't work from remote devices (localhost refers to the device itself).

**Fix:** Set API URL via environment variable when starting dev server:
```bash
VITE_API_URL=http://100.109.59.66:52743/api npm run dev -- --host 0.0.0.0
```

### 3. Dev Server Must Listen on All Interfaces
By default, Vite/webpack only listen on localhost. Add `--host 0.0.0.0` to expose to network:
```bash
npm run dev -- --host 0.0.0.0
# or in vite.config.ts: server: { host: '0.0.0.0' }
```

### 4. Touch Targets Need Special Handling
Desktop hover interactions don't work on touch. Common issues:
- Buttons that appear on hover require tap-to-reveal, then tap-to-click (double-tap)
- Absolute positioning outside parent bounds breaks touch targeting

**Fixes:**
- Always show interactive elements on touch devices: `@media (hover: none) { ... }`
- Use larger touch targets (minimum 44x44px per Apple HIG)
- Add `-webkit-tap-highlight-color: transparent` to remove iOS flash
- Use `e.stopPropagation()` on buttons to prevent parent click capture
- Position buttons inside their parent's bounds (no `left: -20px` hacks)

### 5. Frontend Error Logging is Essential
When testing remotely, you can't see the browser console. Set up frontend→backend error forwarding:

```typescript
// Frontend logger
fetch('/api/frontend-log', {
  method: 'POST',
  body: JSON.stringify({ level: 'error', message, stack })
});

// Backend endpoint
app.post('/api/frontend-log', (req, res) => {
  console.log(`[Frontend ${req.body.level}]`, req.body.message);
  res.json({ logged: true });
});
```

### 6. Get Tailscale IP Quickly
```bash
tailscale ip -4
# Returns: 100.109.59.66
```

### 7. Serve Files via Tailscale for Quick Sharing
```bash
cd /tmp && python3 -m http.server 8899
# Access at http://100.109.59.66:8899/filename.png
```

## Debugging Checklist

When remote mobile testing isn't working:
1. [ ] Is dev server listening on `0.0.0.0`? (check `lsof -i :PORT`)
2. [ ] Is API URL set to Tailscale IP, not localhost?
3. [ ] Does CORS allow the Tailscale IP range (`100.*`)?
4. [ ] Are errors being logged to backend?
5. [ ] Are interactive elements visible without hover?
