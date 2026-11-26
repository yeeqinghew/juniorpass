# JuniorPASS Component Specifications

All values reference CSS tokens from `client/src/styles/variables.css`.

---

## Button

### Variants

| Variant | Background | Text | Border | Shadow | Use Case |
|---------|------------|------|--------|--------|----------|
| primary | `--gradient-blue` | `--text-white` | none | `--shadow-primary` | Main CTAs (Book, Register) |
| default | `--bg-white` | `--text-primary` | `1.5px solid --border-medium` | none | Secondary actions (Cancel, Back) |
| ghost | transparent | `--primary-color` | `1.5px solid --primary-color` | none | Outline style (Filters, Options) |
| danger | `linear-gradient(135deg, #ff4d4f, #ff7875)` | `--text-white` | none | `0 4px 12px rgba(255,77,79,.3)` | Destructive (Delete, Remove) |
| link | transparent | `--primary-color` | none | none | Inline actions (View details) |
| pink | `--gradient-pink` | `--text-white` | none | `--shadow-pink` | Accent CTAs (Homepage hero) |
| gold | `--gradient-gold` | `--text-white` | none | `0 4px 12px rgba(212,175,55,.35)` | Premium actions (Upgrade) |

### Sizes

| Size | Height | Padding X | Font Size | Radius |
|------|--------|-----------|-----------|--------|
| sm | `--button-height-sm` (32px) | 12px | `--font-size-sm` (13px) | `--radius-sm` (8px) |
| md (default) | `--button-height-md` (40px) | 20px | `--font-size-base` (14px) | `--radius-sm` (8px) |
| lg | `--button-height-lg` (48px) | 28px | `--font-size-lg` (16px) | `--radius-sm` (8px) |
| pill | `--button-height-md` (40px) | 20px | `--font-size-base` (14px) | `--radius-full` (9999px) |

### States

| State | Transform | Shadow | Opacity |
|-------|-----------|--------|---------|
| default | none | per variant | 1 |
| hover | `translateY(-2px)` | `--shadow-primary-hover` | 1 |
| active | `translateY(0)` | reduced | 1 |
| disabled | none | none | `--opacity-disabled` (0.6) |
| loading | none | none | 0.7 |

### Font

- Family: `--font-family`
- Weight: `--font-weight-medium` (500)
- Display: `inline-flex`, `align-items: center`, `gap: 8px`
- Transition: `--transition-base` (0.3s ease)

---

## Input

### Sizes

| Size | Height | Padding | Font Size |
|------|--------|---------|-----------|
| sm | `--input-height-sm` (32px) | 8px 12px | `--font-size-sm` (13px) |
| md (default) | `--input-height-md` (40px) | 8px 12px | `--font-size-base` (14px) |
| lg | `--input-height-lg` (48px) | 12px 16px | `--font-size-lg` (16px) |

### States

| State | Border | Background | Ring |
|-------|--------|------------|------|
| default | `--border-medium` (#d9d9d9) | `--bg-white` | none |
| hover | `--primary-color` (#98BDD2) | `--bg-white` | none |
| focus | `--input-focus-border` (#c8aeb9) | `--bg-white` | `--input-focus-ring` |
| error | `--color-error` (#ff4d4f) | `--color-error-light` | `rgba(255,77,79,.2)` |
| disabled | `--border-light` (#f0f0f0) | `--bg-cream` | none |

### Selection

- Background: `--input-selection-background` (#f2dfe6)
- Color: `--input-selection-color` (#4a3940)

---

## Card

### Variants

| Variant | Shadow | Border | Radius | Use Case |
|---------|--------|--------|--------|----------|
| default | `--shadow-sm` | `1px solid --border-light` | `--radius-md` (12px) | General content containers |
| elevated | `--shadow-md` | none | `--radius-md` (12px) | Pricing tiers, featured items |
| outline | none | `1px solid --border-medium` | `--radius-md` (12px) | Subtle containers, form sections |
| interactive | `--shadow-sm` → `--shadow-md` on hover | `1px solid --border-light` | `--radius-md` (12px) | Class cards, booking cards |
| partner | `--shadow-xs` | `1px solid --border-light` | `--radius-sm` (8px) | Partner logos carousel |

### Spacing

| Area | Padding |
|------|---------|
| sm | `--card-padding-sm` (16px) |
| md (default) | `--card-padding-md` (24px) |
| lg | `--card-padding-lg` (32px) |
| gap between elements | `--spacing-md` (16px) |

### Interactive Card States

| State | Transform | Shadow | Transition |
|-------|-----------|--------|------------|
| default | none | `--shadow-sm` | — |
| hover | `translateY(-4px)` | `--shadow-lg` | `--transition-base` |
| active | `translateY(-2px)` | `--shadow-md` | `--transition-fast` |

### Background

- Default: `--bg-white`
- Accent: `--bg-cream` (#FCFBF8) for highlighted/featured cards
- Gradient overlays: `--gradient-overlay` for hero/banner cards

---

## Badge / Tag

### Variants

| Variant | Background | Text | Border |
|---------|------------|------|--------|
| primary | `--primary-color` (#98BDD2) | `--text-white` | none |
| success | `--color-success-light` (#f6ffed) | `--color-success-dark` (#237804) | `1px solid --color-success` |
| error | `--color-error-light` (#fff1f0) | `--color-error-dark` (#a8071a) | `1px solid --color-error` |
| warning | `--color-warning-light` (#fff7e6) | `--color-warning-dark` (#d46b08) | `1px solid --color-warning` |
| pending | `--color-warning-pending-bg` (#fff8e1) | `--color-warning-pending` (#8a5a00) | `1px solid --color-warning` |
| info | `--color-info-light` (#e6f7ff) | `--color-info` (#1890ff) | `1px solid --color-info` |
| pink | `--bg-light-pink` (#fef5f9) | `--accent-pink-dark` (#e88bb1) | `1px solid --accent-pink` |
| tier-basic | `--tier-basic-light` (#91d5ff) | `--text-dark` | none |
| tier-value | `--primary-light` (#b8d9e8) | `--text-dark` | none |
| tier-premium | `--accent-gold` (#d4af37) | `--text-white` | none |
| muted | `--border-light` (#f0f0f0) | `--text-muted` (#666) | none |

### Sizes

| Size | Padding | Font Size | Height | Radius |
|------|---------|-----------|--------|--------|
| sm | 2px 8px | `--font-size-xs` (12px) | 20px | `--radius-full` |
| md (default) | 4px 10px | `--font-size-xs` (12px) | 24px | `--radius-full` |
| lg | 6px 12px | `--font-size-sm` (13px) | 28px | `--radius-full` |

---

## Alert

### Variants

| Variant | Background | Border-left | Icon Color | Use Case |
|---------|------------|-------------|------------|----------|
| success | `--color-success-light` | `--color-success` | `--color-success` | Booking confirmed |
| error | `--color-error-light` | `--color-error` | `--color-error` | Payment failed |
| warning | `--color-warning-light` | `--color-warning` | `--color-warning` | Class nearly full |
| info | `--color-info-light` | `--color-info` | `--color-info` | General notifications |
| pending | `--color-warning-pending-bg` | `--color-warning` | `--color-warning-pending` | Booking awaiting confirmation |

### Structure

- Padding: `--spacing-md` (16px)
- Border radius: `--radius-sm` (8px)
- Border left width: 4px
- Icon size: `--icon-sm` (20px)
- Title font weight: `--font-weight-semibold` (600)
- Body font size: `--font-size-base` (14px)

---

## Modal / Dialog

### Sizes

| Size | Max Width | Use Case |
|------|-----------|----------|
| sm | 400px | Confirmations, quick actions |
| md (default) | 520px | Forms, booking details |
| lg | 680px | Complex flows, document upload |
| xl | 800px | Calendar views, class schedules |

### Structure

- Header padding: 24px 24px 16px
- Body padding: `--card-padding-md` (24px)
- Footer padding: 16px 24px 24px
- Border radius: `--radius-lg` (16px)
- Shadow: `--shadow-2xl`
- Backdrop: `rgba(0,0,0,0.45)`

---

## Table

### Row States

| State | Background | Use Case |
|-------|------------|----------|
| default | `--bg-white` | Normal row |
| hover | `--bg-cream` (#FCFBF8) | Mouse over |
| selected | `rgba(152,189,210,0.1)` | Selected row |
| striped | alternate `--bg-cream`/`--bg-white` | Long lists |

### Cell Alignment

| Content Type | Alignment |
|--------------|-----------|
| Text | Left |
| Numbers, Credits | Right |
| Status badge | Center |
| Date/Time | Left |
| Actions | Center or Right |

### Spacing

| Element | Value |
|---------|-------|
| Cell padding | `--spacing-sm` 12px `--spacing-md` 16px |
| Header font weight | `--font-weight-semibold` (600) |
| Row height (compact) | 44px |
| Row height (default) | 52px |
| Header background | `--bg-cream` (#FCFBF8) |
| Border | `1px solid --border-light` |

---

## Navigation

### Header

- Height: 84px (`ConfigProvider Layout.headerHeight`)
- Background: `--bg-cream` (#FCFBF8)
- Padding desktop: 0 150px
- Position: sticky, `z-index: --z-fixed` (1030)
- Shadow on scroll: `--shadow-sm`

### Menu Items

| State | Color | Font Weight |
|-------|-------|-------------|
| default | `--text-primary` (#333) | `--font-weight-normal` (400) |
| hover | `--primary-color` (#98BDD2) | `--font-weight-medium` (500) |
| active/selected | `--primary-color` (#98BDD2) | `--font-weight-semibold` (600) |

### Mobile Drawer

- Width: 100%
- Background: `--bg-cream`
- Items: full-width, padding `--spacing-md`
- Font size: `--font-size-lg` (16px)

---

## Form Layout

### Label

- Font size: `--font-size-base` (14px)
- Font weight: `--font-weight-medium` (500)
- Color: `--text-primary` (#333)
- Margin bottom: `--spacing-xs` (8px)

### Helper / Error Text

- Font size: `--font-size-xs` (12px)
- Error color: `--color-error` (#ff4d4f)
- Helper color: `--text-muted` (#666)
- Margin top: 4px

### Spacing Between Fields

- Vertical gap: `--spacing-md` (16px)
- Section gap: `--spacing-xl` (32px)

---

## Step Indicator (Homepage "Getting Started")

| Size | Dimension | Font Size | Font Weight |
|------|-----------|-----------|-------------|
| sm | `--step-number-size-sm` (36px) | `--font-size-xl` (18px) | `--font-weight-bold` (700) |
| md | `--step-number-size-md` (40px) | `--font-size-2xl` (20px) | `--font-weight-bold` (700) |
| lg | `--step-number-size-lg` (48px) | `--font-size-3xl` (24px) | `--font-weight-bold` (700) |

- Shape: circle, `--radius-full`
- Background: `--gradient-blue`
- Color: `--text-white`
- Shadow: `--shadow-primary`
