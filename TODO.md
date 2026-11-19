# Angles Phase 1 Outcomes

## Disk-backed folder dashboard
- Scan `/data` dynamically on requests; every directory is a Chapter.
- Show chapter cards with chapter name and count of `.html` files.
- Provide `+ New Chapter Folder` and `Refresh Disk` actions.
- Selecting a chapter immediately routes to Coding Area with that folder active.

## Coding Area and file tree
- Show selected chapter, `← Back to Folders`, `+ New File`, every `.html` file, and `styles.css`.
- Clicking a file saves current editor content before opening the selected file.
- Support `Ctrl+B` to collapse/expand the sidebar.
- Autosave through `PUT /api/chapters/:folder/files/:file`.
- Provide quick inserts and shortcuts: `Alt+T`, `Alt+Q`, `Alt+G`, and `Alt+P`.

## Shorthand compiler
- Convert supported custom table, question/option, explanation, and grid shorthand to standard HTML before DOMParser/rendering.
- Never pass raw custom shorthand tags to DOMParser.

## Full-screen preview grid
- Render compiled HTML and chapter CSS across a full-width 25-column × 35-row canvas.
- Show column labels `1–25`, row labels `1–35`, and a hover coordinate tooltip.
- Provide Graph Grid ON/OFF with `Ctrl+G`.
- Provide F11 full-screen study mode hiding top navigation.

## Navigation placeholders
- Provide pages for Folder Page, Coding Area, Preview, Graph, Shortcuts, and Settings.
- Graph, Shortcuts, and Settings contain clean Phase 2 placeholder containers.

## Local-first architecture
- Use Node.js/Express plus vanilla HTML/CSS/JS.
- Treat `/data` as the only source of truth.
- Do not introduce a database or `manifest.json`.
