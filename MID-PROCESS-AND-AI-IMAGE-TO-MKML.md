# MID Process and AI Image-to-MKML Guide

This guide explains why Angles uses MIDs, how chapter/concept routing works, what the Question Index accepts, and how to turn notebook or book images into a safe, reviewable MKML batch. It is written for both a human operator and an AI automation that reads images and prepares Angles questions.

For the complete reference to all general MKML features (math, study tags, tables, quizzes, grids, and CSS markers), see [MKML-SYNTAX.md](./MKML-SYNTAX.md). This document focuses on MIDs and the conversion/routing process.

---

## 1. What a MID is

**MID** means **Mapping ID**. It is a stable, machine-readable address attached to a chapter, a concept inside that chapter, or an unmapped destination.

A full MID generally has this form:

```text
ROOT.CONCEPT
```

For example:

```text
PN.C2
```

- `PN` is the **chapter root** (Pronoun in the example).
- `C2` is the chapter’s **concept identifier** (Concept 2 in the example).
- The dot joins the chapter and concept parts.

The printed chapter name, file name, heading, book title, and MID are different things. A folder can be named `Pronoun`, a note can be named `Part-1.html`, and both can carry root `PN`. A MID is the durable identity used to route and count questions; do not derive it by guessing from a file name.

### Why Angles uses MIDs

MIDs let Angles:

1. Route an incoming question to the right chapter and concept file without relying on folder-name spelling.
2. Record one question against multiple concepts when the question genuinely tests more than one.
3. Keep chapter-specific unresolved questions separate from completely unassigned/global questions.
4. Scan the existing notes to show concept frequency, unmapped gaps, question-type counts, and current-paste completion.
5. Keep the question’s topic identity stable when headings or file names change.

MIDs are **classification and routing metadata**. A MID does not determine whether an answer is correct, prove that a chapter’s syllabus is exhaustive, or rewrite the question. The current-paste completion percentage describes only the batch pasted now; it does not use older saved questions as the batch denominator.

---

## 2. The three MID levels

### 2.1 Chapter root

Each ordinary chapter folder has one unique root MID. Angles records it in an HTML comment, typically at the beginning of a chapter HTML note:

```html
<!-- angles-root-mid: PN -->
```

Example mapping:

| Chapter/folder | Root MID | Example full concept MID |
|---|---|---|
| Pronoun | `PN` | `PN.C2` |
| Subject-Verb Agreement | `SVA` | `SVA.C1` |

Those values are illustrative. **Use the root MID already assigned in Angles or explicitly supplied by the user.** Do not silently invent a new root because a name seems obvious.

Root rules enforced by chapter setup/assignment:

- Root is normalized to uppercase and has whitespace removed.
- It must start with a letter and then contain only letters, numbers, or hyphens (examples: `PN`, `SVA`, `BASICS-1`).
- It must be unique across chapter folders.
- `UN` is reserved for the Global Unmapped system folder and cannot be assigned to an ordinary chapter.
- The setup/assignment UI writes the root comment into the folder’s HTML notes and provisions the chapter’s `unmapped.html`.

If a folder has no root yet, assign one before routing questions for that chapter. A missing/unrecognized root cannot safely resolve to an ordinary chapter; unresolved roots can fall through to Global Unmapped.

### 2.2 Chapter concept

Inside a chapter HTML file, a concept is delimited by a **local wrapper MID**:

```html
<mid = c2>
  <h2>State Verbs</h2>
  <!-- explanatory notes and quiz groups for this concept -->
</mid>
```

The matching closing tag is `</mid>`. The currently recognized local concept IDs are `C` followed by digits (`C1`, `C2`, `C17`, etc.) and the reserved local unmapped ID `UN`. Use the wrapper’s existing identifier exactly. Do not use a free-form title such as `<mid = State Verbs>` as a concept ID.

If the chapter root is `PN`, the wrapper `<mid = c2>` resolves to the full concept MID `PN.C2`. Wrapper matching is case-insensitive, but the AI should emit uppercase IDs for clarity and consistency. The `<h1>`–`<h6>` heading inside a wrapper supplies a display title; the heading itself is not the identifier.

A concept can live in any HTML file in that chapter folder. Angles scans HTML notes in the folder to find wrappers, not just the file currently open.

### 2.3 Question target

Inside each question card, use the **full MID**, not just its local concept suffix:

```html
<mid = PN.C2>
```

A compound target uses slash separators:

```html
<mid = PN.C2 / PN.C5>
```

This still represents **one question block**. It means the same question is associated with both concepts. On commit, Angles attempts to append the question to each destination concept wrapper. It does not mean “make two copies in the paste” and it does not double the overall pasted-question denominator.

Use `/` between targets. Although the live completion counter can split commas too, the Question Index ingestion parser’s canonical multi-MID delimiter is `/`; do not use commas in automation output.

---

## 3. The two unmapped destinations

### Chapter-local unmapped: `ROOT.UN`

Use the known chapter’s root with concept `UN` when the chapter is known but the exact concept is genuinely not mapped yet:

```html
<mid = PN.UN>
```

This routes to that chapter folder’s `unmapped.html`, within its local unmapped wrapper:

```html
<!-- angles-root-mid: PN -->
<h1>PN Unmapped Questions</h1>
<mid = UN>
  <h2>Unmapped Questions</h2>
  <!-- chapter-local unmapped question cards are stored here -->
</mid>
```

The chapter root comment remains `PN`; the wrapper is local `UN`; an incoming question uses the full target `PN.UN`. Do not confuse those three forms.

### Global Unmapped: `UN.UN`

Use `UN.UN` only when no ordinary chapter can be identified/resolved:

```html
<mid = UN.UN>
```

It routes to the system `Global Unmapped` folder and its `unmapped.html`, whose root is reserved `UN` and whose local wrapper is `UN`.

### Routing decision table

| Incoming target | Interpretation | Destination |
|---|---|---|
| `PN.C2` and the `PN.C2` wrapper exists | Known chapter and mapped concept | The chapter HTML file containing the local `C2` wrapper |
| `PN.UN` | Known chapter, concept not mapped | `Pronoun/unmapped.html`, local `<mid = UN>` wrapper |
| `PN.C99` but no `C99` wrapper exists | Known chapter, requested concept unknown to registry | Dry-run marks it as an unknown concept and requires explicit user confirmation before it is routed to `PN.UN` |
| `UN.UN` | No ordinary chapter/concept resolved | `Global Unmapped/unmapped.html`, local `<mid = UN>` wrapper |
| `ZZ.C1` and no chapter has root `ZZ` | Root cannot be resolved | Global Unmapped if the system folder is configured; otherwise a missing-global warning |

**Automation policy:** Do not invent a new concept code such as `PN.C99` to avoid using UN. If the correct existing concept is unambiguous, use that concept. If the chapter is known but no existing concept is a fair match, use `PN.UN`. If the chapter itself is uncertain, ask the user; use `UN.UN` only when the batch is intentionally being captured globally rather than guessed into a chapter.

### Optional `<gap>` label

A gap label may explain why a question is in an unmapped bucket:

```html
<gap = Relative pronouns>
```

It is optional and has no effect on MID routing or completion arithmetic. Angles groups equal gap labels in its gap view. An unmapped item without a gap label is grouped as `General Unmapped`. Use a concise, consistent topic label; do not write an explanation or question sentence in the gap field.

---

## 4. Required Question Index card format

The Question Index ingests `<Qn>...</Qn>` blocks. Each block must contain:

- At least one `<mid = ...>` target.
- A non-empty question `<type = ...>`.
- A non-empty `<text = ...>` prompt.
- An `<Options>` block with at least one A–D option.
- An `<answer = A>`–`<answer = D>` key.

`<explanation = ...>` is useful but optional. `<gap = ...>` is optional. Missing any required field makes dry-run invalid; the AI must not silently make up a missing correct answer or distractor.

### Canonical, commit-ready block

```html
<Qn>
  <mid = PN.C2>
  <type = Error Spotting>
  <text = If I were <ud = State Verb Complement Trap **rl**>him</ud>, I would never accept such an unfair proposal.>
  <Options>
    <A = Replace “him” with “he”>
    <B = Replace “were” with “was”>
    <C = Add “to” before “accept”>
    <D = No error>
  </Options>
  <answer = A>
  <explanation = Preserve the source explanation here, or leave this field out if none was supplied.>
</Qn>
```

A batch is normally several such cards concatenated together. For Question Index dry-run, each card needs its own single opening `<Qn>` and one closing `</Qn>`. An outer `<qn all>...</qn all>` quiz group is not needed for ingestion. Do not paste code fences, explanations about the conversion, or commentary as if they were questions; keep those outside the MKML batch.

### Field behavior and compatibility

- Preferred type field: `<type = Error Spotting>`. The ingestion parser also accepts the older `<qn type = Error Spotting>` spelling inside a question block; AI output should use `<type = ...>`.
- Preferred option: `<A = Option text>` (likewise B–D). The renderer supports legacy `<A Option text>` too; automation should use the equals form.
- Preferred answer: `<answer = B>`. `<ans = B>` is a supported alias. Some older answer-element forms render in saved notes, but AI ingestion should use `<answer = B>`.
- Type is mandatory for new Question Index ingestion. Labels are trimmed, whitespace is collapsed, and analytics normalize them to uppercase. The app does not enforce a closed type vocabulary; choose a known label from the user’s supplied convention when possible.
- The prompt may contain supported inline MKML, including `<math == ...>`, `<b>...</b>`, `<x = ...>`, `<ok = ...>`, `<hide == ...>`, and `<ud = label>...</ud>`. See the general syntax reference for their exact behavior.
- Field values end when the parser encounters the next recognized question field/structural tag. Keep each field in a clear order and do not place custom field-opening strings literally inside a value unless escaped/rewritten safely.

### Question types

Type is classification, not MID. A type answers “what kind of question format/task is this?”; a MID answers “which chapter/concept does it test?”

Examples seen in the app include `Error Spotting`, `Multiple Choice`, `Fill in the Blanks`, `Sentence Improvement`, `Conceptual Analysis`, `Conceptual Checking`, `Conceptual Reasoning`, `Structural Mechanics`, and `Trap Identification`. The labels are examples, not an enforced exhaustive list. Preserve a supplied type label; do not infer an overly specific format from the chapter alone. If the image has no clear type and the user has not authorized type inference, ask or flag it before calling the output commit-ready.

---

## 5. Why compound MIDs matter—and how to avoid double counting

Some questions test two mapped concepts. The correct representation is one `<Qn>` with a compound `<mid>`:

```html
<Qn>
  <mid = PN.C2 / PN.C5>
  ...one prompt, one option set, one answer...
</Qn>
```

Do **not** create two identical `<Qn>` blocks merely to assign it to both concepts. That would make the pasted-batch counter see two closing `</Qn>` tags and therefore two questions.

Angles handles this distinction in two ways:

1. During commit, it tries each unique destination wrapper once and checks duplicate question text within that destination.
2. During current-paste reporting, the overall denominator is the number of closing `</Qn>` tags. Each complete question block counts once overall. A chapter row counts a block once if at least one MID has that chapter’s root. Several concepts under the same root do not multiply the chapter count.

For a question carrying both `PN.C2` and `BS.C1`, it can appear once in the PN scope and once in the BS scope because it explicitly targets both chapters, but it remains one block in the overall paste denominator. In the usual case, compound tags refer to several concepts within one chapter; only assign cross-chapter targets when the source genuinely tests both.

---

## 6. Exact current-paste completion calculation

The completion panel is an audit of the text pasted **right now**. It is intentionally separate from saved-note coverage.

### Overall formula

1. Count the closing `</Qn>` tags in the pasted content (case-insensitive). That is `total`.
2. Scan each complete `<Qn>...</Qn>` question block’s `<mid = ...>` values.
3. If any MID in a block contains an exact `UN` segment—such as `PN.UN`, `UN.UN`, or a compound value containing more than one UN target—count that block once as unmapped.
4. `complete = total − unmapped`.
5. `completion % = complete / total × 100`.

If total is zero, show no percentage, not 0%. Do not use the stored index, previous pasted batches, question count in the chapter files, or a local browser cache in this calculation.

Example: 5 closing tags and 2 question blocks with one or more UN MID segments means 3 complete out of 5 = **60%**.

### Scope rows

- **Chapter `PN`:** count a block once if it has one or more `PN.` targets. Count it unmapped in the PN row only if a target for that root is `PN.UN`.
- **Global Unmapped:** show blocks with an `UN.` target in a separate row. A question tagged only `UN.UN` is not silently assigned to some chapter just because it is the only chapter represented elsewhere in the paste.
- If one compound question explicitly has both a chapter target such as `PN.C2` and a global target such as `UN.UN`, it counts once in overall and once in each explicitly targeted scope.
- Case differences such as `pn.un` versus `PN.UN` do not create different targets. Normalize MID comparisons to uppercase.

The percentage is a routing-coverage signal for this sample, not proof that a chapter is universally complete and not a measure of learning/answer accuracy. Repeated audits from different books/sources provide more evidence over time; the current batch percentage should still be read only as a score for that batch.

---

## 7. How dry-run, commit, and re-sync work

### Step 1 — Dry-run preview (read-only)

The user pastes the batch and runs **Preview routing / Dry Run**. The server parses each `<Qn>` and checks required fields. For every MID, it resolves the root, concept wrapper, and destination. The preview shows question number, MIDs, type, and destinations. Dry-run does not write any question files.

A non-existent concept under a known root is labelled as an unknown concept and held for explicit confirmation. A completely unresolved root uses the Global Unmapped route if configured. Fix typos in the MID or clarify the mapping before proceeding; do not treat a successful route to a fallback as proof that the original MID was correct.

### Step 2 — Human review and confirmation

Before commit, compare the preview with the source image and taxonomy:

- Number of question cards versus the image/source.
- Prompt, options, and answer key.
- Type on every question.
- Root and concept for every target.
- Any chapter-local/global unmapped decisions.
- Unknown-concept confirmations, if any.

A question whose target concept is missing requires explicit confirmation before the app routes it to that chapter’s `UN` bucket. The UI’s normal commit button also asks the user to confirm the shown local destinations. An image-reading AI should not bypass those gates or call the commit operation just because dry-run returned a route.

### Step 3 — Commit / auto-append

After approval, commit appends each nonduplicate question block into the local HTML wrapper for each target. If an unmapped file or local `<mid = UN>` wrapper is needed, the server can create the standard wrapper. Writes for the batch are applied through the server’s batch-write routine. The response reports added copies, duplicates skipped, and warnings. Review warnings; a question can be skipped if a destination wrapper does not exist.

Duplicate detection is based on question text normalized by removing HTML tags, collapsing whitespace, trimming, and lowercasing. Punctuation and meaning are not deeply compared. Therefore, the AI should not assume that near-duplicates with changed wording will be automatically detected, and a duplicate warning is not a guarantee that two differently worded items are equivalent.

### Step 4 — Refresh and inspect

Refresh scans current files from disk. Confirm that mapped questions appear under the intended concepts and unmapped questions appear in the expected file. The Question Index fetch bypasses browser HTTP caching; the current batch text itself is in the input area, not a persisted MID registry.

### Step 5 — Re-sync a manually corrected chapter-local unmapped question

If a user later retags a question in a chapter’s `unmapped.html` from `PN.UN` to a known target such as `PN.C2`, Re-sync attempts to place it in that mapped wrapper. It removes the source copy from `unmapped.html` only after the target wrapper is found and the question is safely present or inserted. Missing wrappers become conflicts and are not silently discarded. Re-sync operates on ordinary chapter unmapped files; it is not a global `UN.UN` migration tool.

---

## 8. Notebook-image to commit-ready batch workflow

An AI converting notebook/book images should use the stages below. Keep transcription, classification, and routing distinct so an uncertain OCR guess does not become a confidently wrong MID.

### Stage A — Inspect images and establish context

1. Read every provided image, including margins, question numbers, option letters, answer marks, handwritten corrections, and continuation across page boundaries.
2. Ask for the chapter/folder and its assigned root MID if they are not supplied.
3. Ask for the existing concept map (full MIDs plus short descriptions/headings) or use a current index export supplied by the user. Do not guess concept IDs from chapter names or invent `C` numbers.
4. Ask what type vocabulary to use if the user has a controlled classification scheme. Otherwise choose a simple, defensible nonempty type based on the visible question format, and call out uncertain classifications.
5. Determine whether the images contain actual answerable multiple-choice questions. The Question Index requires options and a correct answer. Plain notes, incomplete stems, or questions without a supplied/clearly marked answer cannot be made commit-ready without user permission to author missing content.

### Stage B — Transcribe faithfully

For each question:

1. Keep source order and question numbering in the audit notes.
2. Transcribe the prompt and every option; preserve negation, quantifiers, punctuation that changes meaning, names, numbers, formulas, symbols, and the source’s distinctions among option labels.
3. Preserve visible answer markings and explanations accurately. Never infer an answer key from general knowledge if the source does not establish it, unless the user explicitly asks the AI to solve questions; label those answers as AI-solved for review.
4. Represent visible mathematical expressions with `<math == ...>` where useful and readable; do not change their value.
5. Use supported inline MKML tags only when they clearly match intended formatting. Do not place the outer Question Index syntax inside a normal value as literal text.
6. Do not silently fix grammar, rewrite distractors, fill a cropped line, or invent a missing question. If a likely OCR correction changes meaning, preserve the literal reading and flag the ambiguity.

### Stage C — Assign type and MID separately

For each transcribed question:

1. Choose a nonempty `<type = ...>` label using the user’s supplied vocabulary where available.
2. Compare the tested rule/skill against the provided concept map.
3. Assign one full concept MID if there is one clear match.
4. Use a compound slash-separated MID only if the same question genuinely tests multiple mapped concepts. It is still one `<Qn>` block.
5. If chapter root is known but no existing concept is suitable, target `ROOT.UN` and add a concise `<gap = ...>` label when helpful.
6. If chapter root or provenance is uncertain, ask. Do not use Global Unmapped as a convenient substitute for an uncertain chapter decision unless the user wants it held globally.
7. If a concept code is suggested but not present in the supplied taxonomy, do not invent a new wrapper ID. Either use the appropriate `ROOT.UN` or stop for approval.

### Stage D — Validate the batch before showing it as ready

The AI should perform these checks before output:

- Count the cards it is about to emit; there must be exactly one closing `</Qn>` per question.
- Every card has one or more valid full MIDs, a nonempty type, a nonempty text field, at least one option, and a known answer key.
- Every `<Options>` opening has a closing `</Options>`.
- Each opening `<Qn>` has exactly one corresponding closing `</Qn>`.
- No image caption, analysis note, Markdown fence, answer commentary, or explanation outside a card is mixed into the paste block.
- Compound MIDs are slash-separated and do not create duplicate question blocks.
- Every MID root matches the supplied chapter map or an explicit `UN` destination.
- Any low-confidence OCR, type, answer, or mapping decision is called out separately and is not represented as certain.
- Recalculate the overall batch summary from the actual emitted blocks and MID tags; do not copy a previously reported percentage.

The app’s dry-run is the final structural/routing check; AI-side validation does not replace it.

### Stage E — Present two clearly separated outputs

The automation should return:

1. **Paste block:** only the complete `<Qn>...</Qn>` cards, ready to paste into the Question Index. If unresolved information prevents a valid card, do not label the block commit-ready.
2. **Conversion audit notes outside the block:** source image/page and question number; assigned type and MID(s); whether the answer was visibly supplied or AI-solved; any OCR uncertainty; overall question/UN/complete counts; and the per-chapter/global split.

This separation prevents notes about the conversion from being pasted and counted as questions.

---

## 9. Ready-to-reuse automation prompt

Copy this prompt into the image-conversion workflow and fill in the bracketed context. Attach the notebook/book images and the concept map with it.

```text
Convert the attached notebook/book images into an Angles Question Index MKML batch.

CHAPTER/FOLDER: [folder name]
CHAPTER ROOT MID: [exact assigned root, e.g. PN]
EXISTING CONCEPT MAP: [full MID -> concept description; include only real existing wrappers]
QUESTION-TYPE VOCABULARY: [user's allowed/preferred labels, or “use the visible question format and report uncertain choices”]
ANSWER POLICY: [source-marked answers only / AI may solve, but label every AI-solved answer for review]

Rules:
- Inspect all images and preserve source order. Transcribe prompts/options/marks faithfully; do not invent cropped or unreadable content.
- Produce one <Qn>...</Qn> block per actual question, with exactly one closing </Qn> tag per block.
- Every card must use canonical tags: <mid = ...>, <type = ...>, <text = ...>, <Options> with <A = ...> through the needed option letters, and <answer = X>. Add <explanation = ...> only when provided or explicitly requested. Add optional <gap = ...> for an unmapped question where useful.
- Use existing full MIDs only. Separate multiple genuine targets with `/`; never duplicate a question block just to assign two concepts.
- Use ROOT.UN only when the chapter is known and the concept is genuinely unmapped. Use UN.UN only when the item is intentionally global/unassigned. Do not invent roots or concept IDs. Ask if the root, answer, text, or mapping is uncertain enough to affect correctness.
- Do not fabricate options or answers to make an incomplete source pass validation. If a required field is missing, list the question as unresolved and do not present it as commit-ready.
- Output a single paste block containing only MKML question cards. After it, provide separate audit notes: source/page/question references, chosen type/MID, visible vs AI-solved answers, uncertainties, total question count, UN count, completed count, overall completion, and chapter/Global Unmapped counts and percentages.
- Recount from the exact emitted closing </Qn> tags and MIDs; compound MIDs count one question overall. Never reuse a prior batch’s totals.
```

---

## 10. Common mistakes and their corrections

| Mistake | Correct practice |
|---|---|
| Using a folder or chapter title as if it were the MID | Use the chapter’s assigned root comment, then a real local concept code. |
| Writing `<mid = C2>` in a question | Use the full form, such as `<mid = PN.C2>`. `C2` alone is only the local wrapper ID inside a chapter note. |
| Creating `<mid = PN.C99>` because the number seems available | Confirm that a real `C99` wrapper exists. Otherwise use `PN.UN` or ask before creating a concept. |
| Using `PN.UN` for a question whose chapter is unknown | Use `UN.UN` only for intentional global/unassigned routing; otherwise ask for the chapter. |
| Giving a mapped concept question a `gap` label and assuming that makes it unmapped | Only an `UN` MID segment marks it unmapped; `gap` is descriptive metadata. |
| Treating `PN.C2 / PN.C5` as two questions | Keep one `<Qn>` with two slash-separated targets. |
| Guessing the answer, options, or unreadable text to satisfy validation | Stop and ask, or explicitly label AI-solved content for user review if authorized. |
| Assuming dry-run means data has been saved | Dry-run is read-only. A separate confirmed commit writes the routed files. |
| Assuming a successful global fallback proves a chapter MID was correct | Check preview destination and root identity; unknown roots may route globally. |
| Reading the chapter’s stored coverage as the current sample score | Current-paste completion uses only the present pasted batch and its closing tags/MIDs. |

---

## 11. Compact reference checklist

Before generating a batch, know the root and concept map. For each question, transcribe first, then assign a type, then assign full MID(s). Use `ROOT.UN` for known chapter/unmapped concept; `UN.UN` for global/unassigned. Keep exactly one `<Qn>...</Qn>` per source question. Run local checks, present uncertainties outside the paste block, use the app’s dry-run, inspect the destinations, and commit only after human approval.
