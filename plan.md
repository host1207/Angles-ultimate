# Angles Phase 1 Plan

## Implementation
Angles will use a small Node.js/Express server with a vanilla frontend. The `/data` directory is authoritative and is scanned on every relevant API request; there is no manifest file or database. Express serves `public/`, exposes chapter/file CRUD endpoints, and keeps file names constrained to safe local paths. The frontend is a single-page shell with route-like page states for folders, coding, preview, graph, shortcuts, and settings. The editor stores the active file in a textarea, autosaves with debounced PUT requests, and compiles the shorthand to standard HTML before preview rendering.

## Project structure
- `server.js`: Express server, disk scanner, chapter/file APIs, static serving.
- `public/index.html`: app shell and semantic page regions.
- `public/styles.css`: visual system and responsive layout.
- `public/studio.js`: navigation, editor behavior, keyboard shortcuts, pre-compiler, preview grid.
- `data/`: local chapter folders and starter examples.
- `public/manus-routes.json`: declared page routes.

## Design
Three possible directions: Swiss study lab (0.06), dark terminal notebook (0.07), editorial paper atlas (0.05). Chosen direction: **Swiss study lab**.

- **Design Movement:** Swiss International Typographic Style translated into a focused exam-prep instrument.
- **Core Principles:** ruthless hierarchy, crisp alignment, immediate feedback, restrained decoration.
- **Color Philosophy:** warm off-white paper keeps long study sessions calm; ink-black text gives authority; cobalt marks active actions and chart coordinates; coral signals edits and attention.
- **Layout Paradigm:** split-level workspace rather than a centered marketing page: a compact utility rail above expansive working surfaces, with the preview treated as a graph sheet.
- **Signature Elements:** oversized chapter index numerals, cobalt focus bars, and fine graph-paper rules.
- **Interaction Philosophy:** every action feels like marking a page—selection is visible, autosave is quietly confirmed, and mode changes are reversible.
- **Animation:** short 140–220ms transitions for panels, buttons, and status changes; no looping motion while studying.
- **Typography System:** Inter for interface text, IBM Plex Mono for code, coordinates, shortcuts, and file metadata. Use strong numeric scale for counts and row/column labels.
- **Brand Essence:** a fast, tactile note studio for competitive-exam learners who think in systems; precise, calm, modular.
- **Brand Voice:** direct and editorial. Example lines: “Choose a chapter. Start from the rule.” and “Saved to disk — keep moving.”
- **Wordmark & Logo:** a compact angled bracket mark `⟂` paired with the wordmark, suggesting both angles and a page corner.
- **Signature Brand Color:** cobalt blue `#2457ff`.


## Permanent MKML syntax contract
The user's forms are canonical: `<math == ...>`, `<table r = ... c = ...>` with `<cRC = ...>` cells, and `<qn all>` with nested `<Qn>` cards and documented quiz fields. Each quiz group has an independent Normal/Exam toggle; Normal grades and reveals on option click, while Exam records choices until bottom Submit (or that card's Explanation override), with an answered/total counter and group score. Legacy `mode = normal|exam` is an optional initial-mode alias. `<ud = label **rl**>word</ud>` keeps the word visible while hiding only that annotation's underline/label until the question is revealed. Other study tags include `<x = ...>`, `<ok = ...>`, `<hide == ...>`, `<rule == ...>`, `<trap == ...>`, and `<chain == ...>`. Chapter CSS sections use `<css-id: ID>` and notes connect them with `<link-css-id: ID>`. `grid-text-align: (column, row)` works inside ID, class, and element CSS selectors. The preview has 25 columns, at least 35 rows, and expands vertically as content needs more rows. Preserve ordinary responsive HTML/CSS, the prior `<grid pos="column, row" span="columns, rows">` alias, and local/offline math assets.
