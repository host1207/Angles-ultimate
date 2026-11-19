# Angles Custom Syntax Reference (MKML)

This is the single reference for Angles-authored syntax. Ordinary HTML and CSS remain usable alongside these forms. Use the **Canonical form** in new notes; compatibility forms are identified where the app still accepts them. The preview compiler turns MKML into regular HTML/CSS and uses the local KaTeX bundle for mathematics.

## Quick index

| Purpose | Syntax |
|---|---|
| Inline math | `<math == expression>` |
| Compact table | `<table r = rows c = columns>` with `<cRC = cell>` entries |
| Quiz group/card | `<qn all [mode = normal\|exam]>` containing `<Qn>...</Qn>` |
| Question fields | `<mid>`, `<type>`, `<gap>`, `<text>`, `<Options>`, `<A>`–`<D>`, `<answer>`, `<explanation>` |
| Study/correction | `<x = ...>`, `<ok = ...>`, `<hide == ...>`, `<ud = label>...` |
| Callouts/process chain | `<rule == ...>`, `<trap == ...>`, `<chain == ...>` |
| Grid block | `<grid ...>...</grid>` or `<grid ... />` |
| Grid placement in CSS | `grid-text-align: (column, row);` |
| Flowchart connector | `<line [color = #hex]>(col,row),(col,row),...</line>` |
| Over-box connector | `<line m>(col,row),(col,row),...</line m>` |
| Flowchart text box | `<box points = (c,r),(c,r),(c,r),(c,r) ...>...</box>` |
| Diagram navigation | Preview shortcuts: `Alt` + `+`, `Alt` + `-`, `Alt` + `G`, `F11`; middle-button drag |
| Link a CSS section | CSS `<css-id: ID>` plus HTML `<link-css-id: ID>` |
| Index a chapter/concept | `<!-- angles-root-mid: ROOT -->`, `<mid = cN>...</mid>` |
| Mark a Question Index batch item | Question-level `<mid = ROOT.CN / ROOT.CM>`; optional `<gap = ...>` |

## 1. Inline syntax

### Mathematics

Wrap an expression in `<math == ...>`:

```html
<math == x/y>
<math == a * b>
<math == a // b>
<math == a div b>
<math == sqrt(x^2 + y^2)>
<math == sqrt((9+10)+10)>
<math == cbrt(729)>
<math == (a+b)/(c+d)>
<math == a_1, a_2>
<math == tri ABC ~= tri DEF>
<math == theta, pi, inf>
```

Supported keyboard forms include `*` (multiplication), `/` (fraction), `//` and `div` (division), `+`, `-`, `~=`, `≅`, `!=`, `<=`, and `>=`. Parentheses/brackets/braces group expressions; nested `sqrt(...)` and `cbrt(...)` are supported. Use TeX-style `^` and `_` for powers and subscripts. Recognized Greek/infinity names include `theta`, `pi`, `inf`, and `infinity`. Expressions are converted to TeX and rendered locally.

### Inline emphasis, correction, and reveal

```html
<b>Bold text</b>
<x = incorrect text>
<ok = corrected text>
<hide == reveal this on click>
```

`<x = ...>` marks incorrect text; `<ok = ...>` emphasizes the correction; `<hide == ...>` produces click-to-reveal text. These are inline constructs; use ordinary HTML tags such as `<strong>`, `<em>`, and `<span>` where those semantics are more appropriate.

## 2. Study annotation tags

### Underline with a label

```html
<ud = n>Soldiers</ud>
<ud = v>march</ud>
<ud = Same Person>The doctor and teacher</ud>
<ud = 1st Subject (Singular)>The Prime Minister</ud>
```

The label appears with the underlined word. Both closing spellings are supported:

```html
<ud = n>Soldiers</ud>
<ud = n>Soldiers<ud>
```

The preferred closing form is `</ud>`.

### Reveal-locked annotations in quiz questions

Add `**rl**` to the UD label to keep the word visible but hide its underline and label until the quiz response is revealed:

```html
<text = The <ud = n **rl**>boy</ud> <ud = v **rl**>ate</ud> cookies.>
```

In Normal quiz mode, selecting an answer reveals the card’s locked annotations. In Exam mode, they stay hidden until Submit, unless that card’s Explanation button is used to reveal its explanation early. UD annotations without `**rl**` are not reveal-locked.

## 3. Semantic callouts and chains

```html
<rule == Every and Each take a singular verb.>
<trap == “Every” cannot be followed by “of” without “one.”>
<chain == Find the subject -> Check its number -> Match the verb>
```

- `<rule == ...>` renders a Rule callout.
- `<trap == ...>` renders an SSC Trap callout.
- `<chain == ...>` splits a process into steps. Supported arrow separators are `->`, `➔`, and `&rarr;`.

Semantic blocks can nest. They close using a last-opened, first-closed (LIFO) stack. The `>` in `->` is treated as part of the arrow, not as the end of a semantic block. Ordinary `=` characters inside the block are allowed.

```html
<rule == Outer rule with a <trap == nested warning> inside it.>
```

## 4. Compact tables

```html
<table r = 2 c = 3>
  <c11 = SIGNAL> <c12 = RULE> <c13 = EXAMPLE>
  <c21 = Singular subject> <c22 = Use a singular verb> <c23 = The dog <b>runs</b> fast.>
</table>
```

`r` is the row count and `c` is the column count. A cell marker is `<cRC = content>`: `R` is the 1-based row and `C` is the 1-based column, so `<c21 = ...>` means row 2, column 1. Missing cells render empty. The compiler clamps dimensions to at least 1 and at most 35 rows by 25 columns; however, the compact marker’s current digit-splitting is only reliable for single-digit column numbers. Use an ordinary HTML table if you need more than nine columns. Existing ordinary HTML tables continue to work.

## 5. Interactive quizzes

### Quiz-group wrapper

```html
<qn all>
  <Qn>
    <text = Where <math == [ is / are ]> the list of rules?>
    <Options>
      <A = The list of names are on the desk.>
      <B = The list of names is on the desk.>
    </Options>
    <answer = B>
    <explanation = “List” is singular, so use “is.”>
  </Qn>
</qn all>
```

A group may contain several `<Qn>...</Qn>` question cards. Each card has a prompt, options, correct answer, and optional explanation. The group provides a Normal/Exam toggle, answered count, and—when in Exam mode—a timer and Submit control. Normal mode grades an answer immediately; Exam mode withholds grading until Submit. The card-level Explanation button can reveal a card’s explanation early. An explicitly empty `<qn all></qn all>` is a zero-question placeholder; it does not create a blank question card.

Set the initial mode with an attribute:

```html
<qn all mode = normal>
<qn all mode = exam>
```

`serious` is accepted as an alias for `exam`. If no mode is specified, the initial mode is Normal. The user can switch modes using the group toggle.

### Question fields and canonical option forms

```html
<Qn>
  <mid = PN.C2 / PN.C6>
  <type = Sentence Improvement>
  <gap = Optional missing-concept label>
  <text = Choose the improved sentence.>
  <Options>
    <A = Option one>
    <B = Option two>
    <C = Option three>
    <D = Option four>
  </Options>
  <answer = B>
  <explanation = Add the reasoning here.>
</Qn>
```

`<mid>`, `<type>`, and `<text>` are values, not paired elements; the next recognized question field ends their value. `<gap>` is optional. `<explanation>` is optional. Options may use labels A–D; any number of options may be supplied. The answer letter is case-insensitive and normalizes to lowercase in the quiz renderer.

### Accepted compatibility spellings

Use the canonical forms above for new material. The compiler retains these older forms:

- `<A Option text>` as an alias for `<A = Option text>` (likewise B–D).
- `<ans = B>` as an alias for `<answer = B>`.
- `<answer>B</answer>` / `<ans>B</ans>` are renderer-compatible legacy answer forms; Question Index ingestion should use `<answer = B>`.
- The quiz compiler also accepts a legacy direct-question form under `<qn all>` without an explicit `<Qn>` card wrapper. For new notes, use explicit `<Qn>...</Qn>` cards.

### Question type syntax

Question Index ingestion requires a type. Preferred form:

```html
<type = Error Spotting>
```

The ingestion parser also accepts the legacy type spelling inside the question block:

```html
<qn type = Error Spotting>
```

The type label is trimmed, internal whitespace is collapsed, and indexing/filtering normalizes labels to uppercase (for example, `error   spotting` becomes `ERROR SPOTTING`). The preview renders the canonical `<type = ...>` value as a question badge. Missing types fail Question Index dry-run validation; existing older saved questions without a type appear under `UNTYPED` in analytics.

## 6. Grid blocks and spatial CSS

### Grid wrapper

```html
<grid id="formula-card" class="wide-card">
  <h2>Spatial note</h2>
  <p>This block is positioned by chapter CSS.</p>
</grid>
```

A self-closing empty block is also accepted: `<grid id="empty-card" />`. `id` and `class` are preserved and can target the block from that chapter’s stylesheet.

### Legacy inline position attributes

```html
<grid pos="2, 15" span="11, 8">
  <h2>Legacy-positioned block</h2>
</grid>
```

`pos` is `column, row`; `span` is `columns, rows`. This remains supported for existing notes. A positioned `<grid>` block uses its top-left corner at the selected grid intersection. The canvas starts with at least 75 columns and 70 rows, then grows as needed; there is no authored-coordinate column or row ceiling. Coordinates are positive and 1-based. Each row is 32 CSS pixels high. All positioned note elements, flow lines, and flow boxes use the preview canvas as their shared coordinate origin; row 1 begins at the first numbered horizontal grid line 47 pixels from the canvas top.

### Preferred CSS placement declaration

Use ordinary selectors with the custom `grid-text-align` declaration:

```css
#formula-card {
  grid-text-align: (2, 15);
  width: 42%;
  min-height: 180px;
}

.wide-card { grid-text-align: (5, 4); }
h2 { grid-text-align: (1, 1); }
```

`grid-text-align: (column, row)` is 1-based and uses the same canvas origin as flowchart points. It places the **bottom-left corner of the selected element’s box** at that grid intersection: column `x` maps to `(x - 1) * grid-cell-width` from the canvas left; row `y` maps to `47 + (y - 1) * 32px` from the canvas top. The compiler clears the positioned element’s margin and translates it upward by its own height, so its bottom-left—not its top-left—lands on the coordinate. It can appear in ID, class, or element-selector rules, and supports `!important`. Put the selector’s ID/class on the `<grid>` wrapper to position the whole block; an element selector positions that matched element. Use `<grid pos>` when the wrapper itself should be placed by its top-left corner.

### Flowchart polyline

Use `<line>` for a connector that passes through two or more numbered grid intersections. Angles draws straight segments from point 1 to point 2, point 2 to point 3, and so on:

```html
<line>(2,4),(7,4),(7,9),(12,9)</line>
<line color = #D84A38>(12,9),(15,12),(20,12)</line>
```

Each pair is `(column, row)`: both are positive 1-based integers; columns and rows have no authored-coordinate ceiling. Coordinates identify **grid-line intersections** (not cell centers). `(1,1)` is the first column/row intersection. The points are listed in traversal order. Each `<line>` is an independent polyline; any number can coexist and they are collected in one canvas overlay. Lines default to the page’s ink color and a 2.5-pixel stroke. `color` accepts a 3- or 6-digit hex color. Lines have no arrowheads; they are plain connectors. Normal lines render above normal note content and below flowchart boxes.

Use `<line m>` for a priority polyline that must remain visible over flowchart boxes. It uses the same grid intersections, color option, extent calculation, and unlimited coordinates as `<line>`; only its stacking layer changes. It has no arrowhead. Use the matching close tag `</line m>`.

At least two valid integer points are required. Invalid line markup is skipped and a visible preview warning explains the problem. To make an angled connector, add intermediate points; Angles does not infer bends or route around objects.

### Free-form flowchart text box

Use `<box>` to place a text area over the grid. Exactly four points define its quadrilateral. List the corners **in perimeter order**, either clockwise or counter-clockwise; the shape can be slanted and need not be axis-aligned:

```html
<box points = (3,5),(10,4),(12,9),(5,11) background-color = #FFF4CC color = #202020>
  <b>Decision point</b><br>Check the governing rule.
</box>
```

`points` uses the same grid-line intersection coordinates as `<line>`. Angles derives the initial box bounds from the four vertices. The preview uses **Full mode** (the only mode): content keeps its natural size, and if it exceeds the authored bounds, the box grows to contain it while keeping the top-left of the four-point bounding rectangle fixed; the polygon background scales to the expanded bounds. Content therefore is not clipped. The graph will not automatically move neighboring boxes or reroute connector lines. Text is centered by default. The box sits above the line and note layers, so its opaque fill masks connectors beneath it. Boxes are rendered in source order; later boxes sit above earlier boxes.

- `background-color` sets the fill; default: `#fbfbf7` (the preview-canvas color).
- `color` sets both text and outline color; default: the normal page ink color.
- Both color attributes accept a 3- or 6-digit hex color, such as `#FC0` or `#FFCC00`.
- The box outline is 1 pixel. The box content can include ordinary HTML and the normal Angles MKML constructs, including tables (`<table r=... c=...>`), question groups/cards (`<qn all>...`), concept wrappers, `<grid>` blocks, callouts, underlining, math, and custom formatting. A `<qn all>` inside a flowchart box is displayed on the diagram as a compact question-count thumbnail. Clicking it opens a separate question page containing that group’s interactive cards; an empty placeholder shows `0 questions` and opens an empty-state page. The questions are not rendered inline in the diagram box, and this behavior does not add, move, or route connector lines. Question groups outside flowchart boxes remain inline interactive quizzes. Flow lines/boxes can be nested as geometry syntax too; lines remain canvas-coordinate overlays.
- Four distinct points must form a nonzero-area, non-self-intersecting quadrilateral in the order supplied. Invalid geometry or color is skipped and shown as a preview warning. Do not list points in a crossing order.

Place one manually authored question group inside each box that should represent a question node. A blank wrapper is a usable placeholder; fill it with question cards later:

```html
<box points = (4,8),(9,8),(9,12),(4,12)>
  <qn all></qn all>
</box>

<box points = (12,8),(17,8),(17,12),(12,12)>
  <qn all>
    <Qn>
      <mid = PN.C2>
      <type = Error Spotting>
      <text = Choose the correct sentence.>
      <Options>
        <A = Option one>
        <B = Option two>
      </Options>
      <answer = B>
      <explanation = Explain the rule.>
    </Qn>
  </qn all>
</box>
```

Draw all concept and question-node connectors yourself with `<line>`; question groups never generate or reposition connections automatically.

### Question-specific explanation graph

An explanation may include its own coordinate graph. Geometry is local to that question: it does not extend the chapter canvas or affect another question. Use the **first top-level `<box>` in the explanation as an invisible crop boundary**. The boundary box itself (fill, outline, and body text) is not drawn; its polygon clips the graph. Place the graph’s visible text/boxes inside that boundary and use `<line m>` to draw above those boxes. The graph appears only with that question’s explanation. If no boundary box is supplied, Angles frames the graph to its authored geometry extents.

```html
<Qn>
  <text = Choose the correct form.>
  <Options><A = Option one><B = Option two></Options>
  <answer = B>
  <explanation = The key distinction is the auxiliary shown here.
  <box points = (2,2),(12,2),(12,9),(2,9)>
    <line m color = #D84A38>(3,4),(6,4),(6,7),(10,7)</line m>
    <box points = (3,3),(6,3),(6,5),(3,5) background-color = #FFF4CC>Subject</box>
    <box points = (8,6),(11,6),(11,8),(8,8) background-color = #DBEAFE>Verb</box>
  </box>
</Qn>
```

Each question graph uses the same 1-based grid-intersection coordinates as the chapter canvas. Its horizontal grid cells are 64 px and rows are 32 px; large crops scroll within the explanation so they do not take over the whole question page. `<line>` sits under visible graph boxes and `<line m>` sits over them. The crop boundary is not a node or a connector and does not alter the main flowchart.

The `<line>` and `<box>` tags are removed from normal document flow and rendered as canvas overlays, so they can be written among ordinary note content without reserving blank paragraphs. The preview expands to include authored coordinates and boxes expanded by their content. While navigating, it adds more columns and rows as the visible area approaches an edge (in batches of 25 columns and 35 rows); off-screen grid labels are virtualized and regenerated around the visible area.

Use `Alt` + `+` to zoom in and `Alt` + `-` to zoom out. The range is 5%–300%; shortcuts move in 25% steps above 50% and finer 5% steps at or below 50%. On keyboards where `+` shares the `=` key, press the plus key with `Alt` (and `Shift` if required). Zoom changes only the view, not authored coordinates. Hold the middle mouse button and drag to pan; this moves the viewport, not authored points or boxes. `Alt` + `G` toggles the graph grid background without hiding authored lines, boxes, or coordinate labels. `F11` enters browser fullscreen from Preview, hiding the browser chrome and app navigation; press `F11` again or `Esc` to leave fullscreen. These shortcuts do not change source syntax or stored coordinates.

## 7. Link selected CSS sections to an HTML note

Mark one or more sections in a CSS file:

```css
<css-id: formula>
#formula-card { grid-text-align: (2, 15); }

<css-id: examples>
.example-card { grid-text-align: (4, 20); }
```

Link the wanted section IDs from the corresponding HTML file:

```html
<link-css-id: formula>
<link-css-id: examples>
```

The compatibility alias `<link = formula>` is also accepted in HTML. A linked marker includes its CSS section up to the next `<css-id: ...>` marker (or end of file). Multiple sections can be linked. CSS before the first marker and unmarked stylesheets remain global for compatibility. Link markers are removed from rendered HTML.

## 8. Question Index: chapter, concept, and unmapped MIDs

### Chapter root MID

Each chapter folder should have one unique root MID. The server stores it in an HTML comment, normally near the start of a chapter HTML file:

```html
<!-- angles-root-mid: PN -->
```

`PN` is an example root for Pronouns. The server’s chapter setup/assignment action manages this metadata. The reserved root `UN` is for the system Global Unmapped folder; do not assign `UN` to an ordinary chapter.

### Concept wrapper MID

A concept wrapper uses a local concept MID such as `C1`, `C2`, or `UN`:

```html
<mid = c1>
  <h2>Case Matrix</h2>
  <rule == A rule for this concept.>
  <qn all>
    <!-- Questions for this concept go here. -->
  </qn all>
</mid>
```

Local wrappers are case-insensitive; the index normalizes identifiers to uppercase. A chapter-root `PN` plus local concept `C1` forms the full MID `PN.C1`. The local `UN` wrapper corresponds to `PN.UN` and is the chapter’s unmapped bucket. It is stored in that chapter’s `unmapped.html` under `<mid = un>...</mid>`.

### Question-level MIDs and compound concepts

Inside a Question Index `<Qn>` block, use full MIDs. Separate more than one target with `/`:

```html
<mid = PN.C1 / PN.C2>
```

This is **one question** associated with two concepts, not two questions. During ingest the same question may be appended to both target wrappers; chapter-level counting eliminates compound duplicates in concept order. Matching is case-insensitive: `PN.un` and `PN.UN` identify the same unmapped concept.

### Unmapped targets

- `PN.UN`: known chapter (`PN`), unmapped concept; routes to that chapter’s `unmapped.html` inside `<mid = un>`.
- `UN.UN`: unknown chapter/folder; routes to the system Global Unmapped bucket/file.
- A known chapter root with a missing concept (for example `PN.C99`): dry-run asks for confirmation before routing it to the chapter unmapped bucket.

`<gap = label>` is optional metadata for an unmapped question. In the gap dashboard, matching labels are grouped by frequency. When a question is unmapped and has no `<gap>`, it is grouped as **General Unmapped**. A `gap` label does not change MID routing or completion arithmetic.

### Batch completion rules

The live completion display is based on the current paste only; it does not include questions already saved on disk. It counts each case-insensitive closing `</Qn>` tag once for the overall denominator. In each complete question block, any exact `UN` segment in a MID marks that question unmapped only once—even for `<mid = UN.UN>` or a compound MID with several UN segments.

- **Overall pasted batch:** `(question blocks − blocks containing UN) / question blocks × 100`.
- **Chapter row `PN`:** include only blocks with a `PN.` MID prefix, count each block once even if it contains multiple PN concepts, and mark it unmapped only when one of its PN targets is `PN.UN`.
- **Global Unmapped row:** show blocks with an `UN.` MID prefix separately. A block tagged only `UN.UN` is not assigned to an ordinary chapter; if a compound MID explicitly includes both `UN.*` and `PN.*`, that same block is counted once in each matching scope.
- A zero-question scope displays no percentage / no batch count rather than a misleading 0%.

## 9. Type and question analytics

Question type labels are normalized to uppercase for indexing and filtering. Existing saved questions without a type are treated as `UNTYPED`. The secondary analytics view supports a type filter and folder filter. Folder totals count a compound question once; concept-level figures are per wrapper, so a compound question can appear under each concept it tests.

## 10. Compatibility and ordinary web markup

Standard HTML elements and regular CSS can be used alongside MKML. The main custom parser recognizes the forms listed above; custom angle-bracket forms are not a replacement for normal HTML semantics. For authored material, prefer the canonical spellings in this guide. Older table, grid, quiz, option, underline, answer, and CSS-link spellings remain only for compatibility where specifically noted.
