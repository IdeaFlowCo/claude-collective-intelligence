# iOS Safari Double-Tap Issue: Ghost Hover States

**Date:** 2026-01-25
**Context:** React outliner app required two taps to expand items on iPad

## The Problem

On iOS Safari, clickable elements required two taps:
- First tap: appeared to do nothing (actually applying hover state)
- Second tap: triggered the click

## Root Cause: Ghost Hover States

When CSS `:hover` rules change an element's appearance (background color, opacity, visibility of children), iOS Safari intercepts the **first tap** to apply the hover state. The **second tap** then triggers the actual click.

This is iOS trying to provide a "hover preview" on a device without hover capability.

## The Three-Part Fix

### 1. Wrap Hover Styles in Media Query

Only apply `:hover` styles on devices that actually support hovering:

```css
/* WRONG - causes double-tap on iOS */
.row:hover {
  background: var(--bg-hover);
}
.row:hover .expand-button {
  opacity: 1;
}

/* CORRECT - only on hover-capable devices */
@media (hover: hover) {
  .row:hover {
    background: var(--bg-hover);
  }
  .row:hover .expand-button {
    opacity: 1;
  }
}
```

### 2. Add touch-action: manipulation

Disables the 300ms double-tap-to-zoom delay:

```css
.clickable-row,
.clickable-text {
  touch-action: manipulation;
}
```

### 3. Add role="button" to Clickable Divs

Tells Safari to treat the element as interactive (click on tap) rather than text content (select on tap):

```tsx
<div
  role="button"
  tabIndex={0}
  onClick={(e) => {
    e.stopPropagation();
    handleClick();
  }}
>
  {content}
</div>
```

## Debugging Checklist

When iOS Safari requires double-tap:

1. [ ] Search CSS for `:hover` rules - wrap them in `@media (hover: hover)`
2. [ ] Check for `onMouseEnter`/`onMouseLeave` handlers - guard with `matchMedia('(hover: hover)')`
3. [ ] Add `touch-action: manipulation` to clickable elements
4. [ ] Add `role="button"` to div elements acting as buttons
5. [ ] Use `e.stopPropagation()` if parent elements also have click handlers

## Key Insight

The `@media (hover: hover)` media query is the inverse of `@media (hover: none)`. Use it to scope hover-only styles to devices that actually support hovering (mouse/trackpad), preventing iOS from creating ghost hover states.
