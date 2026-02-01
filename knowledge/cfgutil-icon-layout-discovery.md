# cfgutil set-icon-layout: Programmatic iPhone Home Screen Rearrangement

**Date:** 2026-01-31
**Context:** Rearranging iPhone home screen icons from a Mac without supervision or MDM enrollment

## The Discovery

Apple's `cfgutil` CLI (bundled inside Apple Configurator.app) provides `set-icon-layout` and `get-icon-layout` commands for managing home screen layouts on iPhones—and **it works on non-supervised consumer devices**, bypassing typical restrictions.

## Key Findings

### 1. cfgutil Location
Located at: `/Applications/Apple\ Configurator.app/Contents/MacOS/cfgutil`

### 2. The Commands
- **`get-icon-layout`**: Crashes with `NSInvalidArgumentException` on modern iOS (widgets and new icon types cause nil insertion into arrays). Don't rely on it.
- **`set-icon-layout`**: Works perfectly on non-supervised consumer iPhones via Apple's AirTraffic protocol, bypassing the `setIconState` restriction.

### 3. Why It Works: Protocol Bypass
The previous assumption that `setIconState` is blocked on non-supervised devices is **wrong**. The `cfgutil set-icon-layout` command uses Apple's internal **AirTraffic protocol**, which has broader capabilities than the typical Mobile Device Management (MDM) restrictions.

### 4. The Complete Pipeline

```bash
# 1. Read current layout (using pymobiledevice3)
pymobiledevice3 springboard state get > layout.json

# 2. Convert to cfgutil JSON format (see next section)
# (Process the JSON to convert dicts to bundle IDs, folders to arrays)

# 3. Close Apple Configurator GUI
# (Important! See gotchas below)

# 4. Push the layout
/Applications/Apple\ Configurator.app/Contents/MacOS/cfgutil set-icon-layout --force layout.json
```

### 5. cfgutil JSON Format

The layout is an **array of arrays**:
- **First element**: Dock (up to 4 apps)
- **Remaining elements**: Home screen pages

Each item can be:
- **App bundle ID**: `"com.example.app"`
- **Web clip URL**: `"https://example.com"`
- **Folder**: Array where first element is folder name

#### Examples

**Single-page folder:**
```json
["My Folder", "com.apple.mobilesafari", "com.apple.mail"]
```

**Multi-page folder:**
```json
[
  "My Folder",
  ["com.apple.mobilesafari", "com.apple.mail"],
  ["com.apple.photos", "com.apple.music"]
]
```

**Full layout:**
```json
[
  ["com.apple.mobilesafari", "com.apple.mail", "com.apple.photos", "com.apple.music"],
  ["com.example.app1", "com.example.app2", ["Utilities", "com.apple.calculator", "com.apple.compass"]],
  ["com.example.app3", "com.example.app4", "com.example.app5"]
]
```

### 6. The --force Flag
Use `--force` to allow layouts that reference apps not currently installed on the device:
```bash
cfgutil set-icon-layout --force layout.json
```

## Gotchas & Solutions

### Problem: "Device already in use" Error
**Cause:** Apple Configurator GUI is running and holding a lock on the device.

**Solution:** Close Apple Configurator completely before running cfgutil:
```bash
killall "Apple Configurator"
```

### Problem: get-icon-layout Crashes
Don't use `get-icon-layout` on modern iOS—it fails with NSInvalidArgumentException. Instead, use `pymobiledevice3 springboard state get` to read the layout.

### Problem: Layout Conversion Complexity
The output from `pymobiledevice3` includes full dictionaries and nested structures. You'll need to:
1. Extract bundle IDs (instead of full app objects)
2. Flatten or convert widgets (which cfgutil may not support)
3. Reorganize into the array-of-arrays format cfgutil expects

## When This Doesn't Work

- Supervised or MDM-enrolled devices may have additional restrictions
- Apps that aren't installed and `--force` isn't used
- Folders on watchOS or older iOS versions (may have different format)

## Hint

cfgutil set-icon-layout works on non-supervised consumer iPhones. Pipeline: (1) Read layout: `pymobiledevice3 springboard state get > layout.json`, (2) Convert to cfgutil format (bundle IDs, not dicts), (3) Push: `/Applications/Apple\ Configurator.app/Contents/MacOS/cfgutil set-icon-layout --force layout.json`. IMPORTANT: Close Apple Configurator GUI first or you get "device already in use". cfgutil get-icon-layout crashes (NSInvalidArgumentException) but set works fine. The previous assumption that setIconState is blocked on non-supervised devices is wrong—cfgutil uses AirTraffic protocol which bypasses that restriction.
