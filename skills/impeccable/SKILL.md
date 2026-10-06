---
name: impeccable
description: Design-vocabulary wrapper around upstream pbakaus/impeccable for GAS single-file UI. Use when the user asks to audit, critique, polish, harden, clarify, adapt, or optimize a frontend surface (index.html). Do not use for backend-only or non-UI tasks.
license: Apache-2.0
metadata:
  author: pbakaus (wrapped for spx-exception-handling)
  version: "4.5.0-wrapper"
  category: web
  upstream: https://github.com/pbakaus/impeccable
  triggers: ["impeccable audit", "impeccable critique", "impeccable polish", "impeccable harden", "design review", "craft floor"]
---

# Impeccable — GAS-localized Wrapper

> Thin wrapper, not a vendor copy. Full upstream (24 commands, 40 references, detector engine) stays upstream; this file only maps the GAS-usable subset and points at it.

## Use When / Don't Use

- **Use:** `audit` / `critique` / `polish` / `harden` / `clarify` / `adapt` / `optimize` on `index.html` (single-file GAS UI).
- **Don't use:** backend-only tasks (use `gas-webapp-review`); `live` / `generate` / `overdrive` / comp-first visuals (need dev-server/HMR/image-gen — unsupported on GAS `/exec`; upstream also forbids localhost helper on production).

## Procedure

1. Read `README.md` contract + `docs/impeccable-notes.md` command map before acting.
2. For `audit`/`critique`: delegate checklist to `../webapp-ui-ux-audit/SKILL.md` (design + a11y + perf + CDP); add only the craft-floor supplement already merged there (eyebrow/side-stripe/glyph-icon/browser-surfaces).
3. For `polish`/`harden`/`clarify`/`adapt`/`optimize`: apply the named direction on `index.html` only; keep `:root` tokens, keep behavior unless asked; deterministic edit (LF, utf-8 no BOM, assert single anchor).
4. Never invent `PRODUCT.md`/`DESIGN.md`; this repo's source of truth is `README.md` contract.

## Detector (manual, optional)

```bash
npx impeccable detect index.html --no-config
```

No install, no CI gate, no API key. Exit `0` clean · `2` findings · `1` scan failure. Findings are diagnostics, not proof — confirm visually across desktop + mobile before fixing.

## Attribution

Upstream `pbakaus/impeccable` v4.5.0, Apache-2.0. Platform refs `ios.md`/`android.md` distill ehmo `platform-design-skills` (MIT) — see upstream `NOTICE.md`.
