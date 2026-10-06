# Impeccable notes — usable subset for spx-exception-handling

Source: `pbakaus/impeccable` v4.5.0 (Apache-2.0), read 2026-10-06 via depth-1 clone (`skill/SKILL.src.md`, `craft-floor.md`, `audit.md`, `polish.md`, `harden.md`, `.opencode/skills/impeccable/SKILL.md`, `command-metadata.json`, `NOTICE.md`).

## Command map

| Impeccable | Local equivalent | Notes |
|---|---|---|
| `audit` / `critique` | `skills/webapp-ui-ux-audit/SKILL.md` | Reuse CDP + WCAG flow; impeccable adds vocab only |
| `polish` / `harden` / `clarify` | audit skill Phase 4 fix step | Keep `:root` tokens, deterministic edit |
| `adapt` / `optimize` | audit skill Phase 2b/3 | Mobile ≤640px card rule + payload ≤90KB stay authoritative |
| `init` / `document` / `extract` | Not adopted | Repo truth is `README.md` contract; no `PRODUCT.md`/`DESIGN.md` split |
| `typeset` / `layout` / `colorize` / `animate` / `delight` | Folded into `polish` | Avoid one-word-command sprawl on single-file UI |
| `bolder` / `quieter` / `distill` | Folded into `polish` | Same reason |

## Deliberately excluded

- `live` / `generate`: need dev-server + HMR + browser picking; GAS serves single `index.html` via HtmlService, verify path is `file://` + `build:local` + `test:chrome`. Upstream forbids injecting the localhost helper into production.
- `overdrive` (shaders/spring/scroll reveals): overkill for an ops tool (scan → Resolve → Thanh Ly); risks perf + readability.
- Comp-first flow (`buildPath: comp`): needs image generation; this harness has none.
- Detector hook (auto-run after UI edits) + CI gate: adds binary download + Node >=22.18; kept manual (`npx impeccable detect index.html --no-config`).

## Detector quick ref

```bash
npx impeccable detect index.html --no-config
npx impeccable detect index.html --json 2> findings.txt
```

Exit `0` = clean, `2` = findings, `1` = scan failure. Respects `.impeccable/config.json` when present — this repo has none by design.

## License

Upstream Apache-2.0. `skill/reference/ios.md` + `android.md` distill ehmo `platform-design-skills` (MIT) per upstream `NOTICE.md`.
