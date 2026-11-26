# JuniorPASS Brand Guidelines v1.0

> Last updated: 2026-11-26
> Status: Active

JuniorPASS is Singapore's enrichment class discovery and booking platform for families. The brand should feel approachable, trustworthy, and gently energetic — a knowledgeable friend that helps parents find the right class for their child without the overwhelm.

---

## Quick Reference

| Element | Value |
|---------|-------|
| Primary Colour | #98BDD2 (Steel Blue) |
| Accent Colour | #f3a5c7 (Blush Pink) |
| Background | #FCFBF8 (Warm Cream) |
| Primary Font | Poppins |
| Voice | Warm, Reassuring, Clear |
| UEN | 202411484C |

---

## 1. Colour Palette

### Primary Colours

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| Steel Blue | #98BDD2 | rgb(152,189,210) | Primary CTAs, links, active nav states |
| Steel Blue Dark | #6aa4c3 | rgb(106,164,195) | Hover states, pressed buttons |
| Steel Blue Light | #b8d9e8 | rgb(184,217,232) | Backgrounds, tints, disabled states |

### Accent Colours

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| Blush Pink | #f3a5c7 | rgb(243,165,199) | Secondary CTAs, highlights, celebration states |
| Blush Pink Dark | #e88bb1 | rgb(232,139,177) | Hover on pink elements |
| Accent Gold | #d4af37 | rgb(212,175,55) | Premium tier, special badges |
| Accent Gold Dark | #b8941f | rgb(184,148,31) | Hover on gold elements |

### Background & Surface

| Name | Hex | Usage |
|------|-----|-------|
| Warm Cream | #FCFBF8 | Page backgrounds, layout containers |
| White | #FFFFFF | Cards, modals, input fields |
| Light Blue | #f8fcff | Soft section backgrounds (blue tint) |
| Light Pink | #fef5f9 | Soft section backgrounds (pink tint) |

### Text

| Name | Hex | Usage |
|------|-----|-------|
| Text Primary | #333333 | Body copy, headings |
| Text Secondary | #555555 | Subheadings, labels |
| Text Muted | #666666 | Captions, helper text |
| Text Dark | #1a1a2e | High-emphasis headings |
| Text Disabled | #999999 | Disabled states only |

### Semantic Colours

| State | Hex | Usage |
|-------|-----|-------|
| Success | #52c41a | Booking confirmed, payment success |
| Success Light | #f6ffed | Success backgrounds |
| Error | #ff4d4f | Form errors, failed actions |
| Error Light | #fff1f0 | Error backgrounds |
| Info | #1890ff | Informational alerts |
| Info Light | #e6f7ff | Info backgrounds |
| Rescheduled | #fa8c16 | Class rescheduled status |
| Cancelled | #ff4d4f | Booking cancelled status |
| Past | #94a3b8 | Past/expired class status |

### Tier Colours

| Tier | Hex | Usage |
|------|-----|-------|
| Basic | #69b1ff | Entry-tier badge |
| Value | #98BDD2 | Mid-tier badge (matches primary) |
| Premium | #d4af37 | Premium-tier badge (matches gold) |

### Accessibility

- Primary `#98BDD2` on `#FCFBF8`: ~3.1:1 — use for decorative/large text only; pair with `#1a1a2e` body text for WCAG AA compliance
- Text Primary `#333` on White: 12.6:1 (AAA)
- Text Muted `#666` on White: 5.7:1 (AA)
- Never use white text on `#98BDD2` or `#f3a5c7` — both fail 4.5:1

---

## 2. Typography

### Font Stack

```css
--font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

Poppins is used for all text — headings, body, labels, buttons. It is geometric, friendly, and legible at all sizes. Use font weight to establish hierarchy, not a separate typeface.

### Font Loading

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
```

### Type Scale

| Token | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| `--font-size-7xl` | 48px | 700–800 | 1.2 | Hero headings |
| `--font-size-6xl` | 40px | 700 | 1.2 | Page titles |
| `--font-size-5xl` | 32px | 700 | 1.2 | Section headings |
| `--font-size-4xl` | 28px | 600–700 | 1.3 | Sub-section headings |
| `--font-size-3xl` | 24px | 600 | 1.3 | Card titles, H3 |
| `--font-size-2xl` | 20px | 600 | 1.4 | H4, prominent labels |
| `--font-size-xl` | 18px | 400–500 | 1.5 | Body large, lead text |
| `--font-size-lg` | 16px | 400 | 1.5 | Body text |
| `--font-size-base` | 14px | 400 | 1.5 | UI labels, default |
| `--font-size-sm` | 13px | 400 | 1.5 | Secondary labels |
| `--font-size-xs` | 12px | 400 | 1.4 | Captions, fine print |

### Weights in Use

| Weight | Name | Usage |
|--------|------|-------|
| 300 | Light | Decorative large text only |
| 400 | Regular | Body copy, descriptions |
| 500 | Medium | Nav items, secondary labels |
| 600 | SemiBold | Buttons, card titles, subheadings |
| 700 | Bold | Page headings, CTAs |
| 800 | ExtraBold | Hero headlines only |

---

## 3. Logo

### Assets

| File | Usage |
|------|-------|
| `client/src/images/logopngResize.png` | Standard nav/header logo (100×50px display) |
| `client/src/images/logopng.png` | High-resolution version |
| `client/src/images/logo70.png` | Compact 70px version |
| `client/src/images/juniorPASS.png` | Hero/marketing image, also used as video poster |

### Display Size

- Header (desktop): width 100px, height 50px
- Header (mobile): width 80px, height 40px
- Minimum digital: 60px wide

### Clear Space

Minimum clear space on all sides = half the logo height.

### Don'ts

- Don't place on a dark or busy background without a white/cream container
- Don't stretch or distort proportions
- Don't apply filters, shadows, or colour tints
- Don't use `logopng.png` (unresized) in production — use `logopngResize.png`
- Don't display below 60px wide

---

## 4. Voice & Tone

### Brand Personality

| Trait | Description |
|-------|-------------|
| **Warm** | We talk to parents like a trusted friend, not a corporate service |
| **Reassuring** | We simplify the overwhelming — parents should feel confident, not confused |
| **Clear** | No jargon, no filler. Every word earns its place |
| **Gently Encouraging** | We celebrate kids' milestones and parents' effort |

### Voice Chart

| Trait | We Are | We Are Not |
|-------|--------|------------|
| Warm | Friendly, human, caring | Informal to the point of unprofessional |
| Reassuring | Calm, dependable, clear | Patronising or over-explaining |
| Clear | Direct, concise | Blunt or cold |
| Encouraging | Celebratory, positive | Pushy or salesy |

### Tone by Context

| Context | Tone | Example |
|---------|------|---------|
| Homepage / marketing | Inviting, benefit-led | "Find the class your child will love." |
| Booking flow | Clear, focused | "Select the package that suits you." |
| Booking confirmation | Warm, celebratory | "You're all booked! See you at class." |
| Error messages | Calm, helpful | "Something went wrong. Try again or contact us." |
| Empty states | Encouraging | "No classes yet — explore what's on." |
| Payment | Reassuring, brief | "Payment received. Credits added to your account." |

### Prohibited Terms

| Avoid | Use Instead |
|-------|-------------|
| Seamless | Easy, simple |
| World-class | Excellent, top-rated |
| Synergy | — (remove entirely) |
| Leverage | Use |
| Revolutionary | — (remove entirely) |
| Kids' enrichment journey | Your child's learning |

### Singapore-specific voice notes

- Use Singapore English conventions: "top up credits", "book a slot", "enrichment class" (not "extracurricular activity")
- Prices in SGD (S$) with two decimal places: S$10.00
- Dates in DD MMM YYYY format: 15 Jan 2025

---

## 5. Imagery

### Photography Style

- **Subjects:** Children actively participating in class — movement, focus, joy
- **Setting:** Real Singapore studio/classroom environments
- **Lighting:** Natural or soft studio light; avoid harsh flash
- **Composition:** Candid over posed; show the child's perspective
- **Colour treatment:** Warm, slightly desaturated — consistent with the cream/blue palette

### Partner Logos

Partner logos live in `client/src/images/partners/`. Accepted formats: PNG, JPG, WEBP. Display size in carousels: max 120px wide, 60px tall, `object-fit: contain`.

Do not crop, recolour, or add effects to partner logos.

### Profile Avatars

Default child avatars are in `client/src/images/profile/boys/` and `client/src/images/profile/girls/`. These are illustrated — maintain a consistent illustrated style if adding new ones.

### AI Image Generation Prompt Template

For marketing assets, prepend:

```
Warm, candid photo of a child in Singapore attending an enrichment class — {sport/activity}. 
Natural soft lighting. Bright, airy background. Colours: cream whites, dusty blue (#98BDD2), 
blush accents. Happy, focused expression. No logos, no text overlays. 
Shot from child's eye level. Authentic, not stock-photo.
```

---

## 6. Design Components

### Buttons

| Type | Background | Text | Radius | Usage |
|------|------------|------|--------|-------|
| Primary | #98BDD2 → gradient | #1a1a2e (dark) | `--radius-full` | Main CTAs |
| Accent Pink | #f3a5c7 → gradient | #1a1a2e (dark) | `--radius-full` | Secondary CTAs |
| Outline | transparent | #98BDD2 | `--radius-full` | Tertiary actions |
| Ghost | transparent | #333 | `--radius-md` | Low-priority actions |

Note: Never use white text on `#98BDD2` or `#f3a5c7` — both fail WCAG contrast.

### Spacing Scale

| Token | Value | Usage |
|-------|-------|-------|
| `--spacing-xs` | 8px | Icon padding, tight gaps |
| `--spacing-sm` | 12px | Compact element gaps |
| `--spacing-md` | 16px | Standard component padding |
| `--spacing-lg` | 24px | Card padding, section gaps |
| `--spacing-xl` | 32px | Between sections |
| `--spacing-2xl` | 48px | Major section dividers |
| `--spacing-3xl` | 64px | Page section padding |
| `--spacing-4xl` | 80px | Hero/marketing sections |

### Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-xs` | 4px | Small tags, badges |
| `--radius-sm` | 8px | Inputs, small cards |
| `--radius-md` | 12px | Standard cards |
| `--radius-lg` | 16px | Large cards, sidebars |
| `--radius-xl` | 20px | Modals, drawers |
| `--radius-2xl` | 24px | Hero cards |
| `--radius-full` | 9999px | Pills, buttons, avatars |

### Shadows

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-xs` | `0 1px 4px rgba(0,0,0,0.04)` | Subtle card lift |
| `--shadow-sm` | `0 2px 8px rgba(0,0,0,0.04)` | Input focus, minor elevation |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.08)` | Cards, sidebars |
| `--shadow-lg` | `0 8px 24px rgba(0,0,0,0.12)` | Modals, dropdowns |
| `--shadow-xl` | `0 12px 32px rgba(0,0,0,0.15)` | Floating panels |
| `--shadow-primary` | `0 4px 12px rgba(152,189,210,0.3)` | Primary button shadow |
| `--shadow-pink` | `0 6px 20px rgba(243,165,199,0.35)` | Pink button/accent shadow |

Always use a shadow token — do not hardcode `box-shadow` values.

### Animation

| Token | Value | Usage |
|-------|-------|-------|
| `--transition-fast` | `0.2s ease` | Hover colour changes |
| `--transition-base` | `0.3s ease` | Most UI transitions |
| `--transition-cubic` | `0.3s cubic-bezier(0.4,0,0.2,1)` | Entrances, layout shifts |
| `--transition-bounce` | `0.4s cubic-bezier(0.175,0.885,0.32,1.275)` | Celebratory/playful motion |

Add `@media (prefers-reduced-motion: reduce)` guards on all non-essential animations.

---

## 7. Code Conventions

### Colour constants (TypeScript/TSX)

Import brand colours from `src/theme.ts` for all Ant Design `ConfigProvider` token usage:

```ts
import { BRAND_PRIMARY, BRAND_BG } from "../theme";
```

Do not hardcode `#98BDD2` or `#FCFBF8` in component files.

### CSS variables

All components must import `styles/variables.css` to access design tokens:

```css
@import '../../styles/variables.css';
```

Use `var(--token-name)` throughout. Do not hardcode pixel values, hex colours, or raw `rgba()` shadow values in component CSS.

### Ant Design theme

The global ConfigProvider theme is set in `layouts/Layout.tsx`, `layouts/LoggedInLayout.tsx`, and `components/HomePage/index.tsx`. Do not create additional `ConfigProvider` wrappers with their own token overrides unless absolutely necessary for a one-off component.

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-11-26 | Initial guidelines — extracted from variables.css, theme.ts, and codebase audit |
