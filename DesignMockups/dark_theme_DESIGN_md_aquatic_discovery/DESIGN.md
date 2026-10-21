---
name: Aquatic Discovery Dark
colors:
  surface: '#0b1326'
  surface-dim: '#0b1326'
  surface-bright: '#31394d'
  surface-container-lowest: '#060e20'
  surface-container-low: '#131b2e'
  surface-container: '#171f33'
  surface-container-high: '#222a3d'
  surface-container-highest: '#2d3449'
  on-surface: '#dae2fd'
  on-surface-variant: '#bcc9cd'
  inverse-surface: '#dae2fd'
  inverse-on-surface: '#283044'
  outline: '#869397'
  outline-variant: '#3d494c'
  surface-tint: '#4cd7f6'
  primary: '#4cd7f6'
  on-primary: '#003640'
  primary-container: '#06b6d4'
  on-primary-container: '#00424f'
  inverse-primary: '#00687a'
  secondary: '#89ceff'
  on-secondary: '#00344d'
  secondary-container: '#00a2e6'
  on-secondary-container: '#00344e'
  tertiary: '#4fdbc8'
  on-tertiary: '#003731'
  tertiary-container: '#1abaa8'
  on-tertiary-container: '#00443c'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#acedff'
  primary-fixed-dim: '#4cd7f6'
  on-primary-fixed: '#001f26'
  on-primary-fixed-variant: '#004e5c'
  secondary-fixed: '#c9e6ff'
  secondary-fixed-dim: '#89ceff'
  on-secondary-fixed: '#001e2f'
  on-secondary-fixed-variant: '#004c6e'
  tertiary-fixed: '#71f8e4'
  tertiary-fixed-dim: '#4fdbc8'
  on-tertiary-fixed: '#00201c'
  on-tertiary-fixed-variant: '#005048'
  background: '#0b1326'
  on-background: '#dae2fd'
  surface-variant: '#2d3449'
typography:
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 44px
    fontWeight: '800'
    lineHeight: 52px
    letterSpacing: -0.03em
  headline-xl-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '800'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 34px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
    letterSpacing: 0em
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0em
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.04em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 1rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system establishes a high-clarity, immersive aquatic exploration platform tailored for discovering swimming pools, aquatic leisure centers, and wellness facilities. The aesthetic merges technical precision with atmospheric oceanic depths, projecting calm authority, pristine cleanliness, and modern utility.

### Visual Style: Luminous Deep Waters
The visual strategy balances deep slate-midnight tonal layering with translucent water-surface accents. High-contrast, pristine white typography cuts through midnight backdrops, while controlled cyan and teal luminescent borders establish focal hierarchy. Tactile depth is created through atmospheric backdrops, subtle colored hairline boundaries, and restrained cyan-tinted ambient glows rather than muddy black drop shadows. The overall interface evokes the feeling of viewing clear, illuminated waters at night: expansive, tranquil, and sharply defined.

## Colors

The palette is engineered for prolonged viewing, low eye strain, and high contrast against dark depths.

### Color Tokens & Roles
- **Canvas Base (`#0F172A`)**: The infinite depth layer; foundational canvas for the entire viewport.
- **Surface Level 1 (`#111827`)**: Recessed modules, table headers, and backdrop panels.
- **Surface Level 2 (`#1E293B`)**: Standard interactive cards, floating toolbars, and filter groups.
- **Surface Level 3 (`#334155`)**: Raised elements, hover states, badges, and secondary action containers.
- **Primary Accent (`#06B6D4` - Cyan)**: Core interactive states, active tabs, primary buttons, and focal pin markers. Emits a soft glow on high-value interactions.
- **Secondary Accent (`#0EA5E9` - Ocean Blue)**: Informational badges, secondary links, and auxiliary indicators.
- **Tertiary Accent (`#14B8A6` - Teal)**: Availability statuses (e.g., "Lane Open", "Booking Available"), wellness indicators, and water temperature metrics.
- **Text Primary (`#F8FAFC`)**: Absolute clarity for headings, active labels, and critical data values.
- **Text Secondary (`#94A3B8`)**: Subdued readability for metadata, helper text, and inactive iconography.
- **Border Hairline (`#334155` / `#1E293B`)**: 1px crisp structural dividers that delineate surfaces without introducing visual noise.

## Typography

The type system relies entirely on Plus Jakarta Sans to deliver geometric precision paired with friendly, approachable rounded terminals. 

### Usage Rules
- Large headings (`headline-xl`, `headline-lg`) utilize tight letter-spacing (`-0.02em` to `-0.03em`) and heavy weights (`700`, `800`) to anchor scanning eyes firmly onto facility titles and city destinations.
- Body text remains consistently at `fontWeight: 400` with open line heights (`1.5` to `1.55`) to maintain optical legibility against dark slate surfaces.
- Labels, meta counters, and status tags use `fontWeight: 600` or `700` paired with uppercase or subtle tracking to enforce structural visual distinction from conversational copy.

## Layout & Spacing

The layout is built on an adaptable 12-column responsive grid system prioritizing spacious, scannable directory discovery.

### Responsive Rules
- **Desktop (1280px+)**: 12 columns, max-width container of `1440px`, 24px (`1.5rem`) gutters, and dynamic outer margin pinned at a minimum of 32px (`2rem`). Split views (map on right, listings on left) maintain a 5:7 column ratio.
- **Tablet (768px - 1279px)**: 8 columns, 20px gutters, 24px margins. Filters collapse into a horizontally scrollable drawer; map switches to an expandable sheet or full-width toggle.
- **Mobile (<768px)**: 4 columns, 16px (`1rem`) gutters, 16px (`1rem`) outer margins. Cards reflow to full width single-column stacks with a sticky bottom navigation bar.

## Elevation & Depth

Visual hierarchy does not rely on muddy black drop shadows; instead, depth is conveyed through layered surface tiers, dark hairlines, and luminous aquatic ambient glows.

### Tonal Hierarchy
- **Level 0 (Base)**: `#0F172A` with zero elevation.
- **Level 1 (Card Default)**: `#1E293B` bounded by a 1px solid `#334155` border.
- **Level 2 (Interactive Floating / Hover)**: `#1E293B` lifted with `box-shadow: 0 10px 25px -5px rgba(2, 6, 23, 0.6), 0 0 16px -2px rgba(6, 182, 212, 0.15)`. The border transitions to `#0EA5E9` at 40% opacity.
- **Level 3 (Modals, Flyouts & Menus)**: `#1E293B` elevated with `box-shadow: 0 25px 50px -12px rgba(2, 6, 23, 0.85)` accompanied by a 1px border of `rgba(248, 250, 252, 0.08)`.
- **Luminous Pin Glow**: Accent elements (such as map markers, active booking selectors) receive `box-shadow: 0 0 20px 2px rgba(6, 182, 212, 0.4)`.

## Shapes

The interface embraces organic, friendly rounded shapes inspired by fluid aquatic architecture and hospitable hospitality directories.

- Standard buttons, badges, and card containers use `0.5rem` (`roundedness: 2`).
- Large content cards, facility carousels, and dialog panels utilize `1rem` (`rounded-lg`).
- Search bars, pill filters, category tags, and quick-action triggers use `1.5rem` to full pill geometry (`9999px`) to create an inviting, human feel.

## Components

### Buttons
- **Primary**: Background `#06B6D4`, text `#0F172A` (deep slate for highest contrast and impact), font weight 600. Hover shifts to `#0EA5E9` with a subtle cyan glow (`0 0 16px rgba(6, 182, 212, 0.35)`). Active state applies a scale transform of `0.98`.
- **Secondary**: Surface `#1E293B`, 1px border `#334155`, text `#F8FAFC`. Hover shifts background to `#334155` and border to `#06B6D4`.
- **Ghost**: Transparent fill, text `#94A3B8`. Hover background `rgba(51, 65, 85, 0.4)`, text `#F8FAFC`.

### Facility Cards
- Base surface `#1E293B` with 1px border `#334155` and `rounded-lg` (16px) corners.
- Media elements use high-aspect photography with a dark bottom gradient overlay (`rgba(15, 23, 42, 0.75) to transparent`) to keep text crisp.
- Content section hosts title (`headline-sm`, `#F8FAFC`), distance badge, opening status (`#14B8A6` for "Open", `#94A3B8` for "Closed"), and pricing tag.

### Chips & Filters
- Inactive: Background `#111827`, border 1px solid `#334155`, text `#94A3B8`, pill-shaped.
- Active: Background `rgba(6, 182, 212, 0.15)`, border 1px solid `#06B6D4`, text `#06B6D4`, with a soft glow effect.

### Input Fields & Search Bars
- Background `#111827`, 1px solid `#334155`, text `#F8FAFC`, placeholder `#64748B`.
- Roundedness: Fully rounded pill for the primary search bar; `rounded-md` (8px) for forms.
- Focus: 1px outline/border `#06B6D4` paired with `0 0 0 3px rgba(6, 182, 212, 0.2)`.

### Checkboxes & Radios
- Size: 18x18px, background `#111827`, border 1.5px solid `#475569`.
- Checked: Background `#06B6D4`, border `#06B6D4`, check icon color `#0F172A`. Subtle focus ring in cyan.

### Aquatic Feature Badges
- Compact indicators for attributes such as "Heated Indoor", "Olympic Size", "Sauna & Wellness".
- Semi-transparent fills (`rgba(14, 165, 233, 0.1)`), 1px hairline border (`rgba(14, 165, 233, 0.2)`), text `#38BDF8`.