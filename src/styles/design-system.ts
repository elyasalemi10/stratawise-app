/**
 * StrataWise Design System Constants
 * Reusable tokens for components that need programmatic access to design values.
 * CSS variables in globals.css are the source of truth — these mirror them for JS usage.
 *
 * Brand palette:
 *   Midnight (text)   #0E314C
 *   Paper (cards)     #FFFFFF
 *   Page bg (cream)   #FAF7F0
 *   Stone (border)    #E5E0D3
 *   Gold (accent)     #CFA753
 *   Slate (muted)     #4A5868
 */

// ============================================
// COLOURS (HSL values matching CSS variables)
// ============================================

export const colors = {
  primary: {
    DEFAULT: "hsl(40, 57%, 57%)",
    hover: "hsl(40, 57%, 47%)",
    foreground: "hsl(208, 70%, 18%)",   // midnight on gold
    hex: "#CFA753",
  },
  secondary: {
    DEFAULT: "hsl(42, 32%, 86%)",        // stone
    hover: "hsl(42, 32%, 78%)",
    foreground: "hsl(208, 70%, 18%)",
    hex: "#E5E0D3",
  },
  destructive: {
    DEFAULT: "hsl(0, 72%, 51%)",
    foreground: "hsl(0, 0%, 100%)",
  },
  warning: {
    DEFAULT: "hsl(38, 92%, 50%)",
    foreground: "hsl(38, 92%, 25%)",
  },
  background: "hsl(40, 47%, 96%)",       // cream #FAF7F0
  foreground: "hsl(208, 70%, 18%)",      // midnight #0E314C
  card: "hsl(0, 0%, 100%)",              // paper
  border: "hsl(42, 32%, 86%)",           // stone #E5E0D3
  muted: {
    DEFAULT: "hsl(40, 25%, 92%)",
    foreground: "hsl(211, 17%, 35%)",   // slate #4A5868
  },
  sidebar: {
    DEFAULT: "hsl(208, 70%, 18%)",      // midnight bg
    text: "hsl(40, 30%, 88%)",
    active: "hsl(40, 57%, 57%)",        // gold
    activeBg: "hsl(208, 70%, 24%)",
  },
} as const;

// ============================================
// TYPOGRAPHY
// ============================================

export const fontFamily = {
  sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
} as const;

export const typography = {
  pageTitle: {
    size: "1.5rem", // 24px
    weight: "600",
    tracking: "-0.025em",
    className: "text-2xl font-semibold tracking-tight text-foreground",
  },
  sectionTitle: {
    size: "1.125rem", // 18px
    weight: "600",
    className: "text-lg font-semibold text-foreground",
  },
  cardTitle: {
    size: "0.875rem", // 14px
    weight: "600",
    letterSpacing: "0.05em",
    className: "text-sm font-semibold uppercase tracking-wide text-foreground",
  },
  body: {
    size: "0.875rem", // 14px
    weight: "400",
    className: "text-sm text-foreground",
  },
  bodySmall: {
    size: "0.75rem", // 12px
    weight: "400",
    className: "text-xs text-muted-foreground",
  },
  label: {
    size: "0.75rem", // 12px
    weight: "500",
    letterSpacing: "0.05em",
    className: "text-xs font-medium uppercase tracking-wide text-muted-foreground",
  },
  metric: {
    size: "1.75rem", // 28px
    weight: "700",
    className: "text-[1.75rem] font-bold tabular-nums text-foreground",
  },
} as const;

// ============================================
// SPACING
// ============================================

export const spacing = {
  page: {
    desktop: "px-6 py-6",
    mobile: "px-4 py-4",
  },
  card: {
    padding: "p-5",
    gap: "gap-4",
  },
  section: {
    gap: "space-y-6",
  },
  form: {
    fieldGap: "space-y-4",
    labelGap: "space-y-1.5",
  },
} as const;

// ============================================
// COMPONENT CLASSES
// ============================================

export const components = {
  button: {
    primary: "bg-primary text-primary-foreground rounded-md h-9 px-4 text-sm font-medium shadow-sm hover:bg-primary/90 transition-colors duration-150",
    secondary: "bg-transparent border border-border text-foreground rounded-md h-9 px-4 text-sm font-medium hover:bg-muted transition-colors duration-150",
    destructive: "bg-destructive text-white rounded-md h-9 px-4 text-sm font-medium hover:bg-destructive/90 transition-colors duration-150",
    ghost: "bg-transparent text-muted-foreground rounded-md h-9 px-4 text-sm font-medium hover:bg-muted transition-colors duration-150",
    icon: "h-8 w-8 rounded-md bg-transparent text-muted-foreground hover:bg-muted transition-colors duration-150 inline-flex items-center justify-center",
  },
  card: {
    base: "bg-card rounded-lg border border-border shadow-none",
    header: "border-b border-border px-5 py-3",
    clickable: "bg-card rounded-lg border border-border shadow-none hover:border-primary/30 transition-colors duration-150 cursor-pointer",
  },
  badge: {
    base: "rounded-full px-2.5 py-0.5 text-xs font-medium inline-flex items-center",
    success: "bg-primary/10 text-primary",
    warning: "bg-warning/10 text-[hsl(38,92%,35%)]",
    error: "bg-destructive/10 text-destructive",
    neutral: "bg-muted text-muted-foreground",
    info: "bg-foreground/10 text-foreground",
  },
  table: {
    header: "bg-muted/50 text-xs font-medium uppercase tracking-wider text-muted-foreground h-10",
    row: "h-12 border-b border-border/50 text-sm hover:bg-muted/30 transition-colors duration-150",
  },
  input: {
    base: "h-9 rounded-md border border-border bg-background text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors duration-150",
  },
} as const;

// ============================================
// CHART COLOURS (for Tremor)
// ============================================

export const chartColors = {
  primary: "#CFA753",      // gold
  secondary: "#0E314C",    // midnight
  muted: "#4A5868",        // slate
  warning: "#f59e0b",
  destructive: "#ef4444",
} as const;
