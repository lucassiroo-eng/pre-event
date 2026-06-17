# Mega Prompt — Factorial Internal Tools Design System

> **Uso**: Copia este prompt al inicio de cualquier proyecto nuevo para replicar exactamente el estilo visual de Pre-Event. Compatible con `/impeccable` para auditoría y refinamiento.

---

## PROMPT

You are building an internal tool for Factorial (HR SaaS). Follow this design system EXACTLY — it defines every visual decision. The tool uses **React 18 + Vite + TypeScript + Tailwind CSS v4 + shadcn/ui (Radix primitives)**.

### 1. FOUNDATIONS

**Font**: Inter (variable weight). Set via CSS: `--font-sans: "Inter", ui-sans-serif, system-ui, sans-serif`. Apply `-webkit-font-smoothing: antialiased` globally.

**Color system**: oklch everywhere. No hex, no hsl. The brand color is Factorial coral `oklch(0.67 0.21 18)` — this is `--primary`. All other tokens derive from it.

**Border radius**: Base `--radius: 0.75rem`. Cards and containers use `rounded-2xl`. Buttons and inputs use `rounded-lg` or `rounded-full` (pills). Inner elements use `rounded-lg`.

**Shadows**: Two custom shadows using brand color:
- `--shadow-pink: 0 10px 40px -10px oklch(0.67 0.21 18 / 0.35)` — hero cards, featured elements
- `--shadow-pink-soft: 0 4px 24px -8px oklch(0.67 0.21 18 / 0.18)` — subtle elevation

Regular cards use `shadow-sm`. Never use default Tailwind shadow scale beyond `shadow-sm` and `shadow-xl` (hover).

### 2. COLOR TOKENS (oklch)

```css
/* Core */
--background: oklch(0.985 0.012 15);      /* pink-tinted off-white */
--foreground: oklch(0.2 0.04 260);         /* near-black with blue tint */
--primary: oklch(0.67 0.21 18);            /* Factorial coral */
--primary-foreground: oklch(0.99 0.005 0); /* white */

/* Surfaces */
--card: oklch(1 0 0);                      /* pure white */
--muted: oklch(0.96 0.015 15);             /* soft pink-gray */
--muted-foreground: oklch(0.5 0.02 260);   /* medium gray */
--secondary: oklch(0.97 0.018 15);
--accent: oklch(0.95 0.035 15);            /* pink wash */
--accent-foreground: oklch(0.3 0.1 18);

/* Borders */
--border: oklch(0.93 0.015 15);            /* very subtle pink-gray */

/* Semantic */
--success: oklch(0.68 0.15 160);           /* green */
--warning: oklch(0.78 0.15 75);            /* amber */
--destructive: oklch(0.6 0.24 18);         /* deep coral */

/* Brand gradient */
--gradient-factorial: linear-gradient(135deg, oklch(0.74 0.19 25) 0%, oklch(0.6 0.23 12) 100%);
```

### 3. DYNAMIC THEMING

The app supports per-entity theming (e.g. per country, per client). The theme hue rotates ALL derived colors:

```ts
// Given a hue h:
--primary: oklch(0.55 0.18 {h})
--accent: oklch(0.95 0.035 {h})
--accent-foreground: oklch(0.3 0.1 {h})
--secondary: oklch(0.97 0.018 {h})
--gradient-factorial: linear-gradient(135deg, oklch(0.74 0.19 {h+10}) 0%, oklch(0.6 0.23 {h-3}) 100%)
--shadow-pink: 0 10px 40px -10px oklch(0.67 0.21 {h} / 0.35)
```

Apply via `document.documentElement.style.setProperty(...)`. Map scale (5 intensity levels) also rotates with hue.

### 4. LAYOUT PATTERNS

**App shell**: `flex min-h-screen w-full bg-background`. Sidebar left (hidden on mobile) + main content right.

**Sidebar**: `w-64`, `bg-sidebar` (soft pink-white). Logo block `h-16` with brand initial in `rounded-lg bg-sidebar-primary`. Nav items: `rounded-lg px-3 py-2 text-sm`. Active state: `bg-sidebar-accent text-sidebar-accent-foreground`. Admin section collapsible with `ChevronDown` rotation animation.

**TopBar**: `sticky top-0 z-30 h-12`, `bg-background/80 backdrop-blur-md`, border-b. Right-aligned pill buttons with `rounded-full ring-1 ring-inset`.

**Page content**: `mx-auto max-w-[1500px] px-6 py-6 lg:px-8 lg:py-8`.

**Responsive grid**: `grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`.

### 5. COMPONENT PATTERNS

#### PageHeader (Hero banner)
Full-width rounded card with brand gradient background and white text:
```
rounded-2xl px-6 py-8 sm:px-10 sm:py-10 text-white shadow-sm
background: var(--gradient-factorial)
```
Overlay with dual radial gradients (light top-right, dark bottom-left) at 30% opacity. Contains brand initial in white square `rounded-xl bg-white text-primary shadow-md`, title `text-3xl font-bold tracking-tight sm:text-4xl`, and subtitle `text-sm text-white/85`.

#### Cards (interactive)
```
rounded-2xl border border-border bg-card p-5 text-left shadow-sm
transition-all duration-300
hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-xl
```
On hover, show a radial gradient glow using the entity's primary color at 18% opacity. Use `group` + `group-hover:opacity-100` pattern.

Arrow icon on hover: `opacity-0 -translate-x-1 → opacity-100 translate-x-0 text-primary`, duration-300.

#### Stat display inside cards
```
text-3xl font-bold tabular-nums leading-none    /* big number */
text-[11px] font-medium uppercase tracking-wider text-muted-foreground  /* label */
```

#### Kicker / Section label
```
text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground
```
Or `text-[11px] font-bold uppercase tracking-wider text-muted-foreground` for section headers.

#### Pill badges (industry/category tags)
```
inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset
```
Per-category color using oklch: `bg-{color}-100 text-{color}-800 ring-{color}-200`.

#### Status pills (TopBar toggles)
```
rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset
```
Active: `bg-primary/10 text-primary ring-primary/30`
Inactive: `bg-background text-muted-foreground ring-border hover:bg-muted`

#### Tables
```
overflow-hidden rounded-lg border border-border
```
Header: `bg-muted/50 text-[10px] uppercase tracking-wider text-muted-foreground`, cells `px-3 py-2`.
Row hover: `hover:bg-muted/30`. Borders: `border-t border-border`.
Numbers: `tabular-nums text-right`.

#### Select/Dropdown (vertical filter)
```
h-11 rounded-2xl border-border bg-background px-4 text-sm font-semibold shadow-sm
hover:border-primary/40 hover:bg-muted/30 focus:ring-2 focus:ring-primary/20
```
Icon prefix in `text-primary`. Dropdown content `rounded-xl`, items `rounded-lg`.

#### Alerts / Banners
```
rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800
```
Icon left (`shrink-0`), text with inline action link `font-semibold underline underline-offset-2`.

#### Dialog
shadcn/ui Dialog, content `max-w-3xl`. Header + scrollable body `max-h-[70vh] overflow-y-auto`.

#### Progress bars
```
overflow-hidden rounded-full bg-muted h-1.5
→ inner: rounded-full bg-primary transition-all duration-500
```

### 6. TYPOGRAPHY SCALE

| Role | Classes |
|---|---|
| Page title (hero) | `text-5xl font-bold tracking-tight sm:text-6xl` |
| Page title (section) | `text-3xl font-bold tracking-tight sm:text-4xl` |
| Card title | `text-xl font-semibold tracking-tight` |
| Card name | `text-sm font-semibold` or `text-base font-semibold` |
| Big number | `text-3xl font-bold tabular-nums leading-none` or `text-2xl` |
| Body text | `text-sm` or `text-base text-muted-foreground` |
| Kicker / label | `text-[10px] or text-[11px] font-bold uppercase tracking-[0.18em]` |
| Micro label | `text-[10px] text-muted-foreground tabular-nums` |
| Country code | `text-[11px] font-medium uppercase tracking-wider text-muted-foreground` |

### 7. SPACING & SIZING

- Page padding: `px-6 py-6 lg:px-8 lg:py-8`
- Card padding: `p-5` (large), `p-3 lg:p-4` (compact)
- Section gap: `space-y-4` or `gap-6`
- Grid gap: `gap-4` (cards), `gap-3` (dense lists)
- Icon sizes: `h-3 w-3` (inline), `h-3.5 w-3.5` (buttons), `h-4 w-4` (nav), `h-5 w-5` (section headers)
- Flag/logo box: `h-14 w-14 rounded-2xl bg-muted/60 shadow-inner` (large) or `h-7 w-7 rounded-full bg-muted` (small)

### 8. ANIMATIONS & TRANSITIONS

- Card hover: `transition-all duration-300`, `hover:-translate-y-0.5`
- Grid column change: `transition-[grid-template-columns] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]`
- Panel appear: `animate-[fade-in_0.5s_ease-out,scale-in_0.5s_cubic-bezier(0.22,1,0.36,1)]`
- Chevron rotate: `transition-transform` + conditional `rotate-180`
- Radial glow on hover: `opacity-0 transition-opacity duration-500 group-hover:opacity-100`
- Default transition: `transition-colors`

### 9. BACKGROUND EFFECTS

**Landing page**: Dual radial gradient blurs as decorative backdrop:
```css
radial-gradient(900px 500px at 85% -10%, oklch(0.9 0.09 320 / 0.45), transparent 60%),
radial-gradient(700px 400px at 0% 100%, oklch(0.88 0.08 250 / 0.4), transparent 60%)
```
Applied to a `pointer-events-none absolute inset-0 -z-10` div.

**Hero banner overlay**: Dual radial at 30% opacity — white glow top-right, dark glow bottom-left.

**Card hover glow**: Radial gradient using entity's primary at 18% opacity, positioned `80% 0%`, 220×160px.

### 10. ICONS

Use `lucide-react` exclusively. Common icons:
- Navigation: `LayoutDashboard`, `Table2`, `Globe`, `Shield`, `Sparkles`
- Actions: `ArrowRight`, `X`, `ChevronDown`, `ChevronRight`, `FileImage`, `LogOut`
- Data: `Users`, `BarChart3`, `Target`, `Layers`, `MapPin`, `Zap`
- Toggle: `Eye`, `EyeOff`

Icon in nav items: `h-4 w-4`. Icon in badges: `h-3 w-3`. Always `shrink-0` when next to text.

### 11. SHADCN/UI COMPONENTS USED

`badge`, `button`, `card`, `dialog`, `input`, `label`, `select`, `separator`, `tabs`, `tooltip`

Install via: `npx shadcn@latest add badge button card dialog input label select separator tabs tooltip`

### 12. LOGIN PAGE PATTERN

Centered card: `flex min-h-screen items-center justify-center bg-background`. Card `max-w-sm p-6 space-y-5`.
Mode toggle (login/signup): `flex rounded-md border p-0.5 text-xs` with active state using `bg-primary text-primary-foreground`.
Error box: `rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive`.

### 13. I18N PATTERN

In-house `useT()` hook returning `t(key)`. Keys like `"app.name"`, `"picker.wons"`, `"overview.subtitle.withMrr"`. Locale derived from context (country selection, user preference). Support en/es/fr/it/de/pt minimum.

---

## USING WITH /impeccable

After building the initial UI, run these passes in order:

1. **`/impeccable teach`** — Feed this design prompt to onboard the project's visual language
2. **`/impeccable critique`** — Get a UX review against this system's patterns
3. **`/impeccable audit`** — Check accessibility (contrast ratios with oklch, focus rings, aria labels)
4. **`/impeccable typeset`** — Verify the typography scale matches (Inter, tracking values, weight distribution)
5. **`/impeccable layout`** — Validate spacing, grid gaps, responsive breakpoints
6. **`/impeccable colorize`** — Confirm oklch palette consistency and dynamic theming
7. **`/impeccable harden`** — Edge cases: empty states, loading, error, overflow, truncation
8. **`/impeccable polish`** — Final pass: micro-interactions, transitions, hover states

For brand-register pages (landing, country picker): also run **`/impeccable bolder`**.
For product-register pages (tables, admin, settings): run **`/impeccable quieter`** if needed.

### /impeccable anti-patterns to watch for in this system:
- Using hex/hsl instead of oklch
- Shadows that don't use the brand-tinted `--shadow-pink` variants
- Cards without the hover lift (`-translate-y-0.5`) or glow effect
- Kicker labels not uppercase or missing tracking
- Numbers not using `tabular-nums`
- Missing `backdrop-blur-md` on sticky headers
- Buttons without `transition-colors`
- Radii inconsistent (should be `rounded-2xl` for containers, `rounded-lg` for inner, `rounded-full` for pills)
