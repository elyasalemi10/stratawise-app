# StrataWise , UI/UX rules

The single place for how this app is built to look and behave. CLAUDE.md
carries the short version and points here; this file carries the reasoning,
because a rule without its reason gets argued with or quietly dropped.

Everything here is enforceable by reading the diff. If a change breaks one of
these, it is wrong even if it looks fine on the screen it was written for.

---

## 1. Never build a control we already have

The bugs this project has hit were never in the shadcn primitives. They were
in the twelve places that reimplemented one.

- **Use `components/ui/*` before writing anything.** If the control does not
  exist there, add it from the shadcn registry. Only hand-roll when the
  registry genuinely has nothing, and then it goes in `components/ui/` with a
  comment saying why.
- **Never a native `<select>`, `<textarea>`, `type="date"`, `type="number"`,
  `type="radio"` or `type="checkbox"`.** Use `Select`, `Textarea`,
  `DatePicker`, `NumberInput`, `RadioGroup`, `Checkbox`.
- **Never a hand-rolled dropdown.** A trigger button, a click-outside
  listener and an absolutely-positioned panel is a `Popover`, a `Select` or a
  `Combobox`. Four of those existed in this codebase, each behaving slightly
  differently. They are gone; do not add a fifth.
- **One implementation per concept.** Two components doing the same job is
  two places for behaviour to drift. If you need a variant, add a prop.

### The shared components, and what each is for

| Component | Use for |
|---|---|
| `Combobox` | Any searchable pick-one. Supports `display`, `defaultOpen`, `ComboboxCreateItem` |
| `Select` | Pick-one from a short fixed list, no search |
| `DatePicker` | Every date. No exceptions |
| `TimeDropdowns` | Every time. Hour / minute / am-pm, built on `Select` |
| `NumberInput` | Every numeric field. `prefix="$"` + `thousandsSeparator` for money |
| `RadioGroup` | Two to four mutually exclusive options that should all be visible |
| `SwapSlot` | Either/or field groups (see §4) |
| `InfoTooltip` | The rare field that genuinely needs a sentence (see §3) |
| `EmptyState` | Anywhere with nothing to show |
| `TableSkeleton` / `KpiSkeleton` / `PageSkeleton` | Loading states (see §5) |

---

## 2. Nothing the app already knows should shimmer

A skeleton stands in for **server data**, and only server data.

- Headings, column labels, field labels, button text, filter chips, tab
  strips, legends, static copy: all render **for real** in the loading state,
  inert. The app knows them before the request goes out.
- Only values shimmer.
- **A page whose first screen is entirely fixed has no skeleton at all.** Its
  `loading.tsx` renders the destination. `/meetings`, generate levies,
  `funds/create` and `meetings/create` all work this way.
- **The skeleton must be the same component the client renders**, exported
  and shared. A `loading.tsx` that draws its own version drifts from the one
  beside it, and the handover between them is a visible jump.
- **A `loading.tsx` covers its segment AND every route under it.** If a
  listing page and its detail pages are siblings, put the listing in a route
  group so its skeleton does not play before the detail one. Two skeletons
  for one navigation is the symptom.

---

## 3. No helper copy

Default to zero explanatory text. Permitted: a label above the input, a
placeholder inside it, and an inline validation error after submit.

- **Placeholders name the field, never preview a value.** `"Account number"`,
  not `"12345678"`. `"Sum insured"`, not `"0.00"`. An example value looks
  like the field is already filled in.
- If a field truly needs a sentence, it goes in an **`InfoTooltip`** next to
  the label , a question mark the reader can ignore. Not a paragraph
  underneath that every user reads past forever.
- If you find yourself wanting two sentences, the design is wrong: rename the
  label, drop the field, or move it to docs.

---

## 4. The user's answers must not move the page

Layout is a promise. A control that was under the cursor a moment ago should
still be there.

- **Either/or field groups go in `SwapSlot`.** Both branches share one grid
  cell, so the container is always as tall as the taller one and nothing
  below it moves. Picking "Online" instead of "In person" must not shift the
  footer buttons.
- **Loading states must not resize their control.** `<Button loading>` keeps
  the label in the layout and overlays a spinner, so the width is identical.
  Never prepend a spinner to the label, and never swap the text for
  "Saving..." , both resize the button the instant it is clicked.
- **Popups must not change document height.** Every Base UI positioner uses
  `positionMethod="fixed"`. Absolute positioning places the popup in document
  coordinates, so one opening near the bottom of a page extends the scroll
  extent and reflows everything.
- **No page-level horizontal scroll, ever.** Wrap, truncate, or give the wide
  thing its own `overflow-x-auto` container.

---

## 5. Surfaces and depth

- **Modal scrims are `bg-black/45`.** Plain black, not a brand tint: a
  coloured wash reads as a filter over the page, black just removes light
  from it. Applies to `Sheet` and `Dialog`.
- **No box shadows on cards.** Borders only. Depth comes from border contrast
  against the grey page.
- **White fields on the grey page.** `bg-card` + `border-border` for every
  input, select trigger and date picker. Never grey-on-grey.
- **Controls in a row share a height.** `h-9` is the standard: `Input`,
  `Select` trigger, `DatePicker`, `NumberInput`. A 32px control beside a 36px
  one is visible.
- **Drawers dismiss by clicking the overlay.** No Cancel button, no X. The
  footer holds forward actions only. Destructive `AlertDialog`s keep Cancel,
  because there is no overlay to click.
- **Anything clickable shows the clicking-hand cursor**, and that includes
  every toggle: `Switch`, `Checkbox`, `RadioGroupItem`. globals.css names
  `[role="switch"]`, `[role="checkbox"]` and `[role="radio"]` next to
  `button` because Base UI gives these a role rather than a `<button>` tag,
  so the button rule misses them, and the caret then stays an arrow over the
  one control on the page whose entire purpose is being clicked. Disabled
  controls keep the arrow, which is the point of the distinction.

---

## 6. Validation

- **Every failure red-outlines its field.** A toast alone does not tell the
  user which box is wrong.
- **Collect every problem, never short-circuit on the first.** Set each
  field's invalid flag, then one toast: the single message if there is one
  problem, "Fix the highlighted fields." if there are several.
- **Validate on submit, never on keystroke.** Hold a per-field flag in state
  that defaults to false, set it in the submit handler, clear it in
  `onChange`. Never derive red from the current value , it paints the field
  red on the first character typed.
- **Empty is a valid intermediate state.** Never coerce a value on every
  keystroke (`parseInt(v) || 1`); it locks the user out of clearing the
  field. Hold the string, parse at submit.

---

## 7. Copy

- **Never an em dash.** Anywhere, including comments. Comma, colon,
  parentheses, or two sentences.
  `grep -r "$(printf '\xe2\x80\x94')" src/` must return nothing.
- **Never a raw enum in front of a user.** Every enum gets a
  `FOO_LABEL: Record<Foo, string>` beside its type, and `FOO_OPTIONS` when it
  feeds a `Select`. Set `<SelectValue>` children to the label, or the trigger
  falls back to the raw value.
- **Missing values render as nothing.** No dashes, no "N/A", no placeholder
  character. The silence is the signal. Exception: real status strings like
  "Unassigned".
- **"OC" is always uppercase in prose.** Lowercase `oc` is for identifiers.
- **No technical jargon.** "read your document", not "parse". Never name the
  model or the OCR provider in anything a user reads.
- **Documents name the legal entity, not the nickname.**
  `owners_corporations.name` is something a manager typed to tell OCs apart.
  Anything a lot owner receives uses `ocLegalName()`.

---

## 8. Forms should own less state than they do

The standing rule is Zod + react-hook-form + shadcn `Form`. Most of this app
predates that and hand-manages `useState` per field with a manual
`problems[]` array, which is why validation feels slightly different on every
screen. New forms use `Form`. Touched forms should move toward it.

---

## 9. A toggle saves itself

- **A page of switches has no Save button.** Flipping a switch IS the
  instruction; a Save button asks the user to remember a second step for a
  change they already expressed, and gives no hint which of eighteen rows is
  unsaved if they forget. Each switch is an independent preference, so there
  is nothing to batch.
- **Persist optimistically, revert on refusal.** Move the switch immediately,
  send the write, and if the server refuses put the switch BACK and toast the
  error. Leaving it showing a state the server does not have is the one
  outcome worse than a slow save.
- **One save must not freeze the others.** A single `pending` flag wired to
  every switch's `disabled` greys out the whole page while one row saves.
  Each control is independent; keep them all live.
- **Confirm the save.** A toast naming what changed ("Levy issued off for
  Email"), so the user is not left guessing whether a silent switch stuck.
- **Bulk actions send only what changed.** "Turn all off" on a column that is
  already mostly off should write the two rows that differ, not eighteen.

---

## 10. Colour , the hierarchy, and what it is for

Five colours carry meaning. Anything outside this list is decoration and
should be a token, not a Tailwind ramp reached into at the call site.

| Role | Token | What it means |
|---|---|---|
| Navy | `--primary` / `--foreground` | The brand, and the ONE primary action per view |
| Gold | `--brand-gold` | Brand accent: sidebar active state, links on auth pages, first chart series |
| Grey | `--muted` / `--secondary` / `--accent` | "This is a control", and every surface that is not doing anything |
| Red | `--destructive` | Something failed, or is about to be destroyed |
| Amber | `--warning` | Something needs attention but nothing is broken |
| Green | `--success` | Settled, paid, verified |
| Blue | `--info` | Neutral fact worth flagging |

**Rules the audit added:**

- **Never reach for a Tailwind colour ramp.** `text-emerald-600`,
  `bg-blue-50`, `text-amber-700` had spread to about forty places, and the
  same meaning had two colours: "paid" was `emerald-600` on one page and
  `green-600` on another. Green and blue are tokens now (`--success`,
  `--info`) with a `-muted` tint for badge backgrounds.
- **Amber is not gold.** `--warning` was `hsl(38, …)` and `--brand-gold` is
  `hsl(40, …)` , two degrees apart, which means a warning badge and a brand
  accent were the same colour to anyone not holding them side by side.
  Warning moved to hue 30 so it reads as orange against the gold.
- **One accent per view.** Gold is what the eye lands on, so two gold
  elements in one frame means no focal point. The empty-state illustrations
  follow the same rule: one gold element each, never two.
- **Category colours are not status colours.** The chart-of-accounts type
  badges (asset / liability / equity / income / expense) are a category
  ramp; they borrow the status tokens where the meaning genuinely overlaps
  and keep their own hues elsewhere. Do not read green there as "good".

**Known tension, deliberately unresolved:** `--primary` and `--foreground`
are the SAME navy, so a primary button is body-text colour with white text
on it. It works, and it is what makes the palette feel like one thing, but
it means a primary button leans entirely on its fill to stand out , which is
why secondary buttons had to become grey rather than white-with-a-border.
If a page ever needs two levels of emphasis above secondary, that is the
constraint that will bite.
