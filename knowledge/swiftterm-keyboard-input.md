# SwiftTerm LocalProcessTerminalView: Keyboard input not working

## Problem
Keyboard input not appearing in terminal even though `keyDown` and `insertText` are being called correctly.

## Root Cause
Setting `terminalView.terminalDelegate = self` on a `LocalProcessTerminalView` breaks keyboard input.

`LocalProcessTerminalView` sets `terminalDelegate = self` in its `setup()` method. Its `send(source:data:)` implementation forwards input to the PTY via `process.send(data:)`. 

If you override the delegate, your `send()` method receives the keyboard input instead - and if it doesn't forward to the PTY, input is silently lost.

## Solution
Only set `processDelegate` (for process lifecycle events), never override `terminalDelegate`:

```swift
// WRONG - breaks keyboard input:
terminalView.processDelegate = self
terminalView.terminalDelegate = self

// CORRECT - keyboard input works:
terminalView.processDelegate = self
// Do NOT set terminalDelegate - LocalProcessTerminalView must remain its own delegate
```

## Key Insight (from Gemini)
Terminals follow the "Round Trip" rule - the view doesn't draw typed characters directly. It sends them to the PTY, the shell echoes them back, then the view draws. Breaking the delegate chain means input never reaches the shell to be echoed.

## Debug Approach
Add logging to trace the full path:
1. `keyDown` - keyboard event received
2. `insertText` - input method handling  
3. `AppleTerminalView.send(data:)` - base send
4. `LocalProcessTerminalView.send(source:data:)` - delegate implementation
5. `LocalProcess.send(data:)` - PTY write
6. `dataReceived(slice:)` - shell echo coming back

If step 4 doesn't appear or goes to the wrong class, the delegate is misconfigured.

## Tags
swiftterm, macos, terminal, keyboard-input, delegate-pattern, pty
