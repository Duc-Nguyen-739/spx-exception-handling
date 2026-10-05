---
name: webapp-ui-ux-audit
description: Comprehensive UI/UX audit for webapps — design language consistency + WCAG 2.2 accessibility + performance + automated verify (audit-css/gs/style/ui + CDP). Bundles design-system, a11y, performance and 3-phase audit into one run with 3-layer cross-audit dedup.
license: MIT
metadata:
  author: van90bg
  version: "1.0"
  category: web
  triggers: ["ui audit", "ux audit", "design review", "accessibility audit", "wcag", "performance audit", "cdp verify"]
---

# Webapp UI/UX Audit — Design + A11y + Perf + Verify

> One run covers: design language → accessibility → performance → automated verify. Output is a P0/P1/P2 table with `file:line` + fix, presented for user approval before fixing (READ→COMPILE→VERIFY→FIX).

## Core Principles

1. **Measure, don't imagine:** geometry `getBoundingClientRect` + computed style via CDP is truth; screenshot is only for feel.
2. **Don't fix before user sees the full picture.**
3. **Deterministic edits** if fixing (CRLF handling, `utf-8-sig` read / `utf-8` write, `newline=''`, assert `count==1`).
4. **Similar components → similar rendering:** any drift between same-type views is an issue.

## Phase 0 — Baseline (run first)

```bash
npm run test:css      # dead CSS class — exit 1 if dead
npm run test:gs       # dead .gs/API drift (if GAS)
node scripts/audit-ui.js        # geometry across viewports (or --quick desktop only)
node scripts/audit-style.js     # computed-style fingerprint (needs Chrome)
npm test              # logic tests — only if logic touched
```

Record PASS/FAIL → audit focuses on FAILs + what scripts don't cover (a11y, perf, design language).

## Phase 1 — Design Language Audit

Start from `component-inventory.md` (6 groups). Check shared components across views against the canonical spec (example from RollCall, 2026-08-16):

| Component | Canonical |
|---|---|
| Topbar | `.view-topbar` + `.view-topbar-title` + actions |
| Data table desktop | 13px font, `th` muted, `tr:hover td` row-hover, `.table-wrap` horizontal scroll |
| Table → card mobile ≤640px | grid `minmax(0,1.2fr) minmax(0,1fr)` gap `3px 10px`; `td` nowrap+ellipsis `15px/1.35`; `::before attr(data-label)` 12px/600/muted; title 16px/700 |
| Search | `.list-search` + Escape clear + ✕ button |
| Badge/pill/button | Single token set (primary/success/danger/amber) — no hard-coded drift |
| Empty/skeleton/loading | `.empty` shared; skeleton cells = real column count; single spinner guard |
| Modal | overlay+dialog, 44px touch, scale-in, Escape closes |

CDP verify: measure card cells (`::before` content, `white-space`, `grid-*`, font, `text-align`) across tables. Known pitfall: desktop column rule `td:nth-child(n)` with specificity `1,1,1` beats mobile base `1,0,2` regardless of order — must override with `tbody td:nth-child(n)` `1,2,1` + `left`.

**Integrated from archived prompts:** Token-first analysis (grep tokens/colors/spacing/type/shadows/radii + read 5–10 components before deciding); **AI slop blacklist:** glassmorphism everywhere, cyan-purple gradient, gradient text, repeated icon+heading card grid, nested cards, large rounded icons above headings, hero metric layout, center-align all, pure #000/#fff, bounce easing — each = P1 if violated.

## Phase 2 — Accessibility Audit (WCAG 2.2)

Checklist:

- **Contrast AA:** normal text ≥4.5:1, large (≥18.66px or 14px bold) ≥3:1; measure computed style, don't guess. Watch badges/amber/danger on white, muted on surface.
- **Keyboard:** all buttons/links operable via Tab+Enter; `:focus-visible` ring; skip-link → `#main-content`; Escape closes modal/filter.
- **Screen reader:** `th[scope="col"]`; `aria-sort` on sortable columns; `aria-live` on toast/live regions only (never on static spinners); `aria-hidden` on decorative icons; labels for search/select/input.
- **Touch (mobile):** buttons ≥44px, funnel ≥33px, pagination ≥36px; no <44px blocking primary action.
- **Motion:** `prefers-reduced-motion` respected.
- **Landmarks/order:** header → main (`tabindex=-1`) → bottom-nav (`aria-label`); correct heading hierarchy.

**Integrated 15 WCAG checks (archived):** `th[scope]` on every `<th>`, `aria-sort`, `role="listbox"+aria-label` for dropdowns, `aria-hidden`, `aria-live="polite"` only dynamic, `@media (prefers-reduced-motion: reduce)` disabling animations, `:focus-visible` not `outline:none` without replacement, touch ≥44px, contrast hex pairs measured, `label`/`aria-label` for inputs, `role="dialog"+aria-modal+focus trap`, Tab+Escape, breakpoint no horizontal overflow, count hard-coded hex outside `:root`.

## Phase 2b — Frontend JS Logic (HtmlService global scope)

For GAS webapps where `app-*.html` modules share global scope:

- **State/race:** `currentTask/counters/selection` race when refresh/polling overwrites active scan? Optimistic `classifyScan/computeCounters` mirrors server (`grep "KHỚP server"` / `mirror server`)?
- **Event/timer leak:** repeated `addEventListener` on modal open → double-fire; `setInterval` not cleared on view change → leak.
- **google.script.run:** missing `withFailureHandler` or swallowing errors (one-way/silent) → P1.
- **XSS/input:** `innerHTML` inserting user input without escape → P0; paste needs `Array.isArray` guard.
- **Global scope:** duplicate `function X` across `app-*.html` = SyntaxError (shared global); semantic duplicates (`computeCounters`/`classifyScan`/`normalize`) outside whitelist = P1; dead code/`console.log`; duplicate `id=""` across templates = DOM bug.
- **Nav:** `showSection`/`repairViewParents` must list all views (e.g., 9 views) — missing = stuck view.

## Phase 3 — Performance Audit

- **Payload:** keep `google.script.run` responses ≤90KB (CacheService 100KB/key) — slim rows to `text+epoch`, strip unused fields, never return `Date` objects.
- **RPC:** count `google.script.run` per flow (e.g., `refreshAll = 3` RPCs); gate flush/sync behind client counter; SWR cache 15s.
- **DOM:** large tables (e.g., 100×20 ≈ 2000 td) — avoid full re-render; paginate; short skeleton.
- **CSS/JS:** single local build; inline SVG icons; external logo hidden on fail.
- **GAS quotas:** `getValues`/`setValues` batch, `CacheService` TTL 30–60s, `LockService` minimal scope.

## Phase 4 — Consolidate + Present

1. Group issues: `P0 (data loss/unusable)` · `P1 (layout break/hard to use)` · `P2 (cosmetic/cleanup)` with `file:line` + fix.
2. **Present for approval** — don't auto-fix (except obvious P0).
3. After fix: re-run Phase 0 → commit/push → check CI SHA (`gh run list --limit 5`).

## Phase 5 — 3-Layer Cross-Audit (multi-agent / multi-report)

When multiple agents audit in parallel, use 3 non-overlapping layers:

| Layer | Role | Tool | Output |
|---|---|---|---|
| 1 — Static sanity | Catch obvious patterns, de-noise | `grep` | P1/P2 potential, mark `[unverified]` |
| 2 — Runtime CDP | Confirm claims + behavioral bugs | CDP click + geometry (desktop + mobile) | P0/P1 confirmed (repro) — only layer that can assign P0 definitively |
| 3 — Consistency | SSOT: one concept → one label | SSOT table + grep UI strings + a11y | P1/P2 inconsistency |

**Rules:** dedup to one row per issue (record first finder); P0 from layer 1/3 needs layer 2 confirmation; claims about deleted/changed attrs → false positive; intentional behavior (commented) → not a bug; layer 1 claims marked `[unverified]`.

## References

- `../gas-webapp-review/SKILL.md` — backend failure modes
- `../systematic-debugging/SKILL.md` — debugging workflow
- `component-inventory.md` — component inventory (if present)
- System skills: `accessibility`, `performance`, `design-system`

## Output Format

Follow host `AGENTS.md §8` if present, otherwise: `TL;DR` + table `| # | Sev | Issue | Location | Fix |` + markers 🔴🟠🟡 + Rule check. See wireframe/redesign supplements below.

## Wireframe for UI Proposal Review

When evaluating a UI proposal (add/move dropdown, panel, layout change), draw ASCII wireframes **before** deciding: ≥2 states (Closed/Open or Before/After) + Mobile (≤991px) if responsive. Use `│─┌┐└┘▾▴` + real class/function labels (`.view-topbar`, `#pane`, `canAction()`). State interaction rules under the frame. This supplements, not replaces, the P0/P1/P2 table.

## Redesign Format (for UI redesign tasks)

When the task is a redesign (not an audit), use: `TL;DR` scale + regression + table `| Component | Before | After | Token | Location |` + ASCII 📐 Layout before→after. All colors/spacing/radii must point to `:root` tokens; include HTML mockup for large views.
