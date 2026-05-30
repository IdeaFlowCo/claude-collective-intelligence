# Smoke-testing the claude-in-chrome browser bridge (and its call-shape gotchas)

## Problem

You want to quickly verify that the `claude-in-chrome` MCP bridge + Chrome extension actually works (connect → navigate → read DOM → screenshot) before relying on it, but the first run wastes time rediscovering non-obvious call shapes.

## Solution

Run this 8-step smoke test. **Pass = page text contains `Example Domain` AND a screenshot image returns.**

1. **Load the tools** (they're deferred — not in the base tool list; calling before loading fails with `InputValidationError` / "No such tool available"):
   ```
   ToolSearch  select:mcp__claude-in-chrome__list_connected_browsers,mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__get_page_text,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__tabs_close_mcp
   ```
2. `list_connected_browsers` → expect non-empty array with `isLocal: true`. **Empty = FAIL (extension not connected), stop here.**
3. `tabs_context_mcp` → required at least once before any tab action; note `tabGroupId`.
4. `tabs_create_mcp` → returns a **new empty tab ID**.
5. `navigate`  `url: https://example.com`  `tabId: <step 4 id>`.
6. `get_page_text`  `tabId: <id>` → expect `Example Domain`.
7. `computer`  `action: "screenshot"`  `tabId: <id>` → expect an image.
8. `tabs_close_mcp`  `tabId: <id>` (single integer).

## Gotchas (the reason to write this down)

- **Tools are deferred** — `ToolSearch select:...` them first.
- **`tabs_create_mcp` takes NO `url`** — it makes an *empty* tab; `navigate` afterward.
- **There is no `take_screenshot` tool** — screenshots are `computer` with `action:"screenshot"`.
- **`tabs_close_mcp` `tabId` must be a single integer**, not an array.
- **Never guess/reuse a tab ID** — each session has its own tab group; use IDs from `tabs_context_mcp`/`tabs_create_mcp`.
- **Multiple browsers connected** → `list_connected_browsers` returns >1; the tool's contract requires `AskUserQuestion` to pick, then `select_browser`/`switch_browser`. Unattended: assert exactly one local browser, else bail.

## Don't confuse with chrome-devtools MCP

`mcp__chrome-devtools__*` is a **separate** bridge (attaches to a `--remote-debugging-port` Chrome). Its smoke test: `list_pages` → `new_page` → `navigate_page` → `take_screenshot`. Unlike claude-in-chrome, chrome-devtools **does** have a real `take_screenshot` tool.

## Confirmed against

Validated 2026-05-30 on Jacob's M5 (extension "personal chrome", macOS, local). Round-trip — connect, navigate to example.com, read text, screenshot, close tab — all passed. Also packaged as the `claude-in-chrome-smoke-test` skill (`~/.agents/skills/claude-in-chrome-smoke-test`).
