/**
 * Strata Wise Design System Constants
 * Reusable tokens for components that need programmatic access to design values.
 * CSS variables in globals.css are the source of truth — these mirror them for JS usage.
 */

// ============================================
// COLOURS (HSL values matching CSS variables)
// ============================================

export const colors = {
  primary: {
    DEFAULT: "hsl(216, 100%, 58%)",
    hover: "hsl(216, 100%, 48%)",
    foreground: "hsl(0, 0%, 100%)",
    hex: "#2b7fff",
  },
  secondary: {
    DEFAULT: "hsl(160, 100%, 37%)",
    hover: "hsl(160, 100%, 30%)",
    foreground: "hsl(0, 0%, 100%)",
    hex: "#00bd7d",
  },
  destructive: {
    DEFAULT: "hsl(0, 72%, 51%)",
    foreground: "hsl(0, 0%, 100%)",
  },
  warning: {
    DEFAULT: "hsl(38, 92%, 50%)",
    foreground: "hsl(38, 92%, 25%)",
  },
  background: "hsl(220, 14%, 96%)",
  foreground: "hsl(220, 26%, 14%)",
  card: "hsl(0, 0%, 100%)",
  border: "hsl(220, 13%, 91%)",
  muted: {
    DEFAULT: "hsl(220, 14%, 96%)",
    foreground: "hsl(220, 9%, 46%)",
  },
  sidebar: {
    DEFAULT: "hsl(220, 26%, 14%)",
    text: "hsl(220, 15%, 65%)",
    active: "hsl(216, 100%, 58%)",
    activeBg: "hsl(220, 26%, 20%)",
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
    primary: "bg-primary text-white rounded-md h-9 px-4 text-sm font-medium shadow-sm hover:bg-primary/90 transition-colors duration-150",
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
    success: "bg-secondary/10 text-secondary",
    warning: "bg-warning/10 text-[hsl(38,92%,35%)]",
    error: "bg-destructive/10 text-destructive",
    neutral: "bg-muted text-muted-foreground",
    info: "bg-primary/10 text-primary",
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
  primary: "#2b7fff",
  secondary: "#00bd7d",
  muted: "#6b7280",
  warning: "#f59e0b",
  destructive: "#ef4444",
} as const;
