# Levy notice PDF, replication spec

Source of truth: `src/lib/pdf/templates/levy-notice.tsx`. This document
describes it precisely enough to build a second document (an invoice) that is
visually indistinguishable in structure, type, colour, spacing and behaviour.

Note: `src/lib/pdf/templates/invoice.tsx` already exists, uses the same palette
and font, and is not wired to anything. Check it against this spec before
starting from scratch.

---

## 1. Rendering stack

| Thing | Value |
|---|---|
| Library | `@react-pdf/renderer` (React components → PDF, server side) |
| Entry | `renderToBuffer(<LevyNotice {...props} />)` in `src/lib/levy-pdf.ts` |
| Page | `<Page size="A4">`, portrait |
| Units | **PDF points.** Every number below is in points (1 pt = 1/72 in). There are no px, no rem. |
| A4 in points | 595.28 wide × 841.89 tall |
| Layout model | Flexbox (React-PDF implements a Yoga subset). Default `flexDirection` is `column`. |
| Storage | Rendered buffer uploaded to R2 at `levies/{oc_id}/{reference}.pdf`; served through an authenticated app route |

React-PDF differences from the browser that bite:

- `lineHeight` is a **multiplier** (1.4 = 140% of font size), not a length.
- `gap` works on flex rows. `marginHorizontal: -24` (negative margin) works and is used for full-bleed bands.
- `borderStyle: "dashed"` works for a single side.
- `objectFit: "contain"` on `<Image>` works with `maxWidth` / `maxHeight`.
- Text wraps automatically inside a `<Text>` whose parent has a definite width. A `<Text>` with `flex: 1` inside a row wraps to the remaining width.
- There is **no automatic keep-together**. A block that should not split across pages needs `wrap={false}` on the `<View>`. The levy notice does not set this anywhere because it is designed as a single page; an invoice with many lines must.

---

## 2. Font

```ts
Font.register({
  family: "NunitoSans",
  fonts: [
    { src: "https://cdn.jsdelivr.net/fontsource/fonts/nunito-sans@latest/latin-400-normal.ttf", fontWeight: 400 },
    { src: "https://cdn.jsdelivr.net/fontsource/fonts/nunito-sans@latest/latin-600-normal.ttf", fontWeight: 600 },
    { src: "https://cdn.jsdelivr.net/fontsource/fonts/nunito-sans@latest/latin-700-normal.ttf", fontWeight: 700 },
  ],
});
```

- Registered once via `import "../fonts"` at the top of the template file. Must run before the first render.
- Static TTFs, not the variable font: React-PDF cannot use variable fonts.
- **Bold is a weight, not a family.** `FONT` and `FONT_BOLD` are both the string `"NunitoSans"`; emphasis is selected with `fontWeight: 600` (semibold) or `fontWeight: 700` (bold). Setting `fontFamily: FONT_BOLD` alone does nothing.
- Three weights in use: 400 body, 600 labels/semibold, 700 headings/totals.
- Page default: `fontFamily: "NunitoSans"`, `fontSize: 10`, `color: #1a1f2e`.

---

## 3. Colour

Two sources, and they are not the same thing.

### 3a. Neutrals, hard-coded in the template

| Token | Hex | Used for |
|---|---|---|
| `foreground` | `#1a1f2e` | All body text, headings, the total-due rule |
| `muted` | `#6b7280` | Labels ("Issued for", "Subtotal"), reference number, subtitle |
| `border` | `#e2e5ea` | Info-row top rule, owner/payment box borders, tear line, slip divider |
| `lightBg` | `#f8f9fb` | Owner box fill, note block fill, payment box fill, special-reason fill |
| `stripe` | `#f5f7fa` | Alternate table rows (even index, 0-based) |
| `white` | `#ffffff` | Table header text |
| `destructive` | `#ef4444` | Arrears amount when positive |

These deliberately do **not** use `src/lib/pdf/styles.ts` (`baseStyles`); the levy notice has its own local palette and layout.

### 3b. Brand colours, passed in as props

```ts
brandColors?: { primary: string; secondary: string }
```

The template defaults to `#2b7fff` / `#00bd7d` if the prop is absent, **but the caller always supplies it**. In `src/lib/actions/levy.ts`:

```ts
let brandColors = { primary: "#0E314C", secondary: "#CFA753" };   // StrataWise midnight / gold
// then, if the management company has valid hex values:
brandColors = {
  primary:   isHex(mc.brand_color)           ? mc.brand_color           : "#0E314C",
  secondary: isHex(mc.brand_color_secondary) ? mc.brand_color_secondary : "#CFA753",
};
```

So: the firm's brand colours if set, StrataWise midnight + gold as the fallback. Replicate that resolution, not the template's internal defaults.

Where each brand colour lands:

- `primary` → table header band background (white text on it).
- `secondary` → the "Payment due" label and date (both), and the left accent border of the special-reason block.

Nothing else is brand-coloured. Everything else is the neutral palette.

---

## 4. Page frame

```
paddingTop:        28
paddingBottom:     20
paddingHorizontal: 24
```

Content width = 595.28 − 48 = **547.28 pt**. No header, no footer, no page numbers, nothing `fixed`. Single page by design.

---

## 5. Vertical structure, top to bottom

Each block is listed with its own box, its margins, and every text style inside it. Values are points unless stated.

### 5.1 Period band

Centred line of text at the very top.

```
container:  alignItems: center, marginBottom: 6
text:       fontSize 11, weight 600, color foreground, letterSpacing 0.5
content:    "{period.start} - {period.end}"     e.g. "1 Jul 2026 - 30 Sep 2026"
```

### 5.2 Top row: logo left, title right

```
row:        flexDirection row, justifyContent space-between, alignItems flex-start, marginBottom 18
```

**Left (logo):**
```
wrapper:    maxWidth 150
image:      maxHeight 60, maxWidth 150, objectFit contain
```
Rendered only if `managementCompany.logo_url` is truthy. **No placeholder** when absent; the left side is simply an empty 150-wide box and the title still right-aligns.

**Right (title block):**
```
block:      alignItems flex-end, maxWidth 280
title:      fontSize 22, weight 600, color foreground, textAlign right
subtitle:   fontSize 9, color muted, marginTop 2, textAlign right
```
Title text is `documentTitle || "Levy Notice"`. Subtitle is the reference number (e.g. `LEV-7`). `maxWidth 280` is what stops a long custom title from pushing into the logo; it wraps right-aligned within 280.

### 5.3 Info row: facts left, owner box right

```
row:        flexDirection row, borderTopWidth 1, borderTopColor border,
            paddingTop 12, marginBottom 18, gap 20
```

**Left column** (`flex: 1`), one line per fact:
```
line:       flexDirection row, marginBottom 4
label:      fontSize 9, color muted, width 60          (fixed)
value:      fontSize 10, color foreground, flex 1      (wraps)
value bold: same, weight 600
```
Lines, in order:

| Label | Value | Style |
|---|---|---|
| Issued for | `ocLegalName(oc)` , the legal entity name | bold |
| Address | `oc.address` | normal |
| ABN | `oc.abn` , **omitted entirely if absent** | normal |
| Issue date | `date` formatted `d MMM yyyy` (see §8) | normal |
| Due date | `dueDate` (pre-formatted string) | bold |

The label column is a hard 60 pt. Values take the rest and wrap; a long legal name wraps under itself, not under the label.

**Right (owner box):**
```
box:        width 200, backgroundColor lightBg, borderWidth 1, borderColor border,
            padding 10, borderRadius 2, alignItems flex-end, alignSelf flex-start
name:       fontSize 11, weight 600, color foreground, marginBottom 2, textAlign right
detail:     fontSize 10, color foreground, lineHeight 1.4, textAlign right
```
Three lines: owner name, owner address, `Lot {n}`. Content width is 200 − 20 = 180 pt; everything wraps right-aligned within that. `alignSelf: flex-start` stops the box stretching to the height of the left column.

### 5.4 Special-levy reason block (conditional)

Rendered only when `specialReason` is truthy (special levies only).

```
box:        marginBottom 14, backgroundColor lightBg,
            borderLeftWidth 3, borderLeftColor brand.secondary,
            paddingLeft 12, paddingRight 12, paddingVertical 10
label:      fontSize 9, color muted, marginBottom 4, weight 600, letterSpacing 0.5   text "Reason / Note"
body:       fontSize 11, color foreground, lineHeight 1.5
```

### 5.5 Custom note block (conditional)

Rendered only when `note` is truthy.

```
box:        marginBottom 14, paddingVertical 8, paddingHorizontal 10,
            backgroundColor lightBg, borderRadius 2
text:       fontSize 9, color foreground, lineHeight 1.5
```

### 5.6 Line items table

Wrapper: `marginBottom 4`.

**The full-bleed trick.** The page has 24 pt of horizontal padding. Every table row sets `marginHorizontal: -24` so its background runs edge to edge, then `paddingLeft: 32, paddingRight: 32` so the text sits 8 pt inside the page's content edge. Replicate both numbers together; changing one without the other misaligns the table text against the blocks above it.

```
header:     flexDirection row, backgroundColor brand.primary, paddingVertical 10,
            marginHorizontal -24, paddingLeft 32, paddingRight 32
header cell: fontSize 11, weight 700, color white
row:        flexDirection row, paddingVertical 10, marginHorizontal -24, paddingLeft 32, paddingRight 32
row striped: same + backgroundColor stripe
cell:       fontSize 10, color foreground
cell right: same, textAlign right
```

Columns are flex ratios, not widths:
```
Description   flex 3
Amount        flex 1.5, right-aligned
```
Striping: **even indices (0, 2, 4…) are striped**, odd are plain. The first data row is therefore tinted.

No borders on rows. No borders on the table. Separation is the stripe alone.

Zero items: the header band renders with nothing under it, and Subtotal reads `$0.00`.

### 5.7 Totals block

Right-aligned, fixed width.

```
section:    flexDirection row, justifyContent flex-end, marginTop 6, marginBottom 14
block:      width 240
row:        flexDirection row, justifyContent space-between, paddingVertical 4, paddingHorizontal 6
label:      fontSize 10, color muted
value:      fontSize 10, color foreground, textAlign right
```

Rows, in order:

1. **Subtotal** , sum of line item amounts.
2. **GST** , `includeGst ? round(subtotal × 0.1, 2) : 0`. Always rendered, even as `$0.00`.
3. **Arrears / Credit** (conditional, only when `priorArrears` is provided):
   - Label is `"Credit"` when `amount < 0`, `"Arrears"` otherwise, followed by ` (as of {asOf})`.
   - A positive arrears value is coloured `destructive` (`#ef4444`).
   - A credit is rendered **unsigned in parentheses**: `($240.00)`, not `-$240.00`.
4. **Total amount due**:
   ```
   row:      paddingVertical 6, paddingHorizontal 6, borderTopWidth 1.5,
             borderTopColor foreground, marginTop 2
   label:    fontSize 11, weight 700, color foreground
   value:    fontSize 11, weight 700, color foreground, textAlign right
   ```
   Value is `max(0, subtotal + gst + arrears)`. **It floors at zero**: a credit larger than the period's levy leaves nothing payable and the remainder carries.

### 5.8 Payment-due line

```
row:        flexDirection row, justifyContent flex-end, alignItems center, marginBottom 14, gap 12
label:      fontSize 13, weight 400, color brand.secondary      text "Payment due"
date:       fontSize 15, weight 700, color brand.secondary      the dueDate string
```
The only place on the page where the secondary brand colour is used for type. Label is deliberately regular weight so the date is the headline.

### 5.9 Tear line

```
borderBottomWidth 1, borderBottomColor border, borderStyle dashed, marginVertical 14
```

### 5.10 Payment slip

```
row:        flexDirection row, gap 20, alignItems flex-start
```

**Left** (`flex: 1`):
```
title:      fontSize 14, weight 700, color foreground, marginBottom 10     text "Payment details"
bank row:   flexDirection row, marginBottom 5
bank label: fontSize 13, weight 600, color foreground, width 110         (fixed)
bank value: fontSize 13, color foreground, flex 1
```
Four rows: `BSB:`, `Account No:`, `Account name:`, `Reference:`. Labels include the colon. These are larger (13) than body text (10) on purpose , the slip is the part the owner copies from.

**Right** (a second box, same style as the owner box but wider):
```
box:        width 210, backgroundColor lightBg, borderWidth 1, borderColor border,
            padding 10, borderRadius 2, alignSelf flex-start
line 1:     fontSize 10, weight 600, lineHeight 1.4, textAlign LEFT      managementCompany.name
line 2:     fontSize 10, lineHeight 1.4, marginTop 3, textAlign left     "Lot {n}"
line 3:     fontSize 10, lineHeight 1.4, textAlign left                  oc.address
divider:    marginTop 8, borderTopWidth 0.5, borderTopColor border, paddingTop 6
slip row:   flexDirection row, justifyContent space-between, paddingVertical 2
slip label: fontSize 9, weight 600, color foreground
slip value: fontSize 10, weight 600, color foreground, textAlign right
```
Two slip rows: `Total payable:` and `Due date:`.

Note the owner box (§5.3) is right-aligned text; this box is **left-aligned**. Same fill, border, radius and padding, different alignment and width (200 vs 210).

---

## 6. Number and date formatting

```ts
function fmt(amount: number): string {
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return amount < 0 ? `-$${formatted}` : `$${formatted}`;
}
// 1234.5  -> "$1,234.50"
// -50     -> "-$50.00"
// 0       -> "$0.00"

function fmtDate(date: Date): string {
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}
// -> "5 Sep 2026"
```

- Thousands separators always; two decimals always.
- Sign goes **before** the dollar sign.
- `dueDate` and `levyPeriod.start/end` arrive as already-formatted strings from the caller; only `date` (issue date) is formatted inside the template.
- GST: `Math.round(subtotal * 0.1 * 100) / 100`.

---

## 7. Props contract (what the caller supplies)

```ts
interface LevyNoticeProps {
  managementCompany: { name: string; logo_url: string | null };
  oc: { name; registered_name?; trading_as?; address; abn?; plan_number? ... };   // fed to ocLegalName()
  documentTitle?: string;            // default "Levy Notice"
  referenceNumber: string;           // "LEV-7"
  date: Date;                        // issue date
  lotOwner: { name: string; address: string; lot_number: number };
  levyPeriod: { start: string; end: string };   // pre-formatted
  lineItems: { description: string; amount: number }[];
  dueDate: string;                   // pre-formatted
  paymentInstructions: { eft: { bsb; account_number; account_name; reference } };
  includeGst?: boolean;
  note?: string;
  brandColors?: { primary: string; secondary: string };
  priorArrears?: { amount: number; asOf: string } | null;
  specialReason?: string | null;
}
```

Documents name the **legal entity** (`ocLegalName()`), never the OC's nickname. The management company's `name` (the brand) appears only on the payment slip.

---

## 8. Edge cases and how the layout absorbs them

| Case | What happens | Why it works |
|---|---|---|
| Long document title | Wraps right-aligned within 280 pt, never reaches the logo | `titleBlock.maxWidth: 280`, `textAlign: right` |
| Long owner name / address | Wraps right-aligned inside 180 pt of content; box grows taller, does not widen | Owner box has fixed `width: 200`, `alignItems: flex-end` |
| Long OC legal name or address | Wraps under itself in the value column; the 60 pt label column never moves | `infoLabel.width: 60`, `infoValue.flex: 1` |
| Long line item description | Wraps within the 3-of-4.5 share; amount stays right-aligned on the first line's baseline | Row `alignItems` is default `stretch`; amount cell is `flex: 1.5` |
| Very large amount | Right column is 1.5/4.5 of 547 pt ≈ 182 pt, enough for `$1,234,567.89` | Flex ratio, not a fixed width |
| Negative line item | Renders `-$50.00` in the amount column, no special colour | `fmt()` |
| Credit larger than the levy | Total amount due shows `$0.00`; Credit row shows the full credit in parentheses | `Math.max(0, …)` |
| No logo | Left top cell is empty; nothing else moves | Wrapper keeps `maxWidth 150` regardless |
| No ABN | ABN line is omitted, lines below close up | Conditional render |
| No note / no special reason | Blocks omitted entirely, zero height | Conditional render |
| Zero line items | Header band with no rows; totals all `$0.00` | Nothing guards against it |
| Many line items | **Flows onto page 2 with no keep-together.** The totals, due line and payment slip can be split across pages. | Nothing in the template handles this |

**Two things the invoice must handle that the levy notice does not:**

1. **Pagination.** Wrap the totals block, payment-due line and payment slip in `<View wrap={false}>` so they move to the next page as a unit if they will not fit. Consider `<View fixed>` for a repeated column header if items regularly exceed one page. The levy notice assumes one page because a levy has a handful of lines; an invoice does not.
2. **Two totals that can disagree.** The on-page "Total amount due" floors at zero, but the payment slip's "Total payable" is `subtotal + gst + arrears` **without** the floor. With a credit larger than the invoice, the notice says `$0.00` and the slip says `-$40.00`. Make the invoice compute one value and print it in both places.

---

## 9. Checklist for "exactly the same"

- [ ] A4, portrait, padding 28 / 24 / 20 / 24 (top / right / bottom / left)
- [ ] NunitoSans registered from the fontsource CDN, three static weights, bold via `fontWeight`
- [ ] Neutral hexes exactly as §3a; brand colours resolved as §3b, midnight/gold fallback
- [ ] Blocks in §5 order with the listed margins; period band centred; logo left / title right
- [ ] Info row: 60 pt label column, top rule, owner box 200 wide right-aligned
- [ ] Table full-bleed via `marginHorizontal −24` + `padding 32`, `flex 3 / 1.5`, even rows striped, no borders
- [ ] Totals block 240 wide, right-aligned, 1.5 pt rule above the total, floor at zero
- [ ] "Payment due" in secondary brand colour, 13 regular / 15 bold
- [ ] Dashed tear line, then slip: 13 pt bank rows with 110 pt labels, 210 wide left-aligned box
- [ ] `fmt()` and `fmtDate()` byte-for-byte
- [ ] Plus `wrap={false}` around totals + slip, and a single total value used in both places
