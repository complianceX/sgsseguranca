/**
 * SGS Design System — Token Constants
 *
 * Exporta os nomes das CSS custom properties como constantes TypeScript.
 * Use estas constantes para evitar magic strings e obter autocomplete
 * ao aplicar tokens via `style={{ [DesignToken.BgCanvas]: value }}` ou
 * ao compor classes em runtime com `cn()`.
 *
 * IMPORTANTE: Não importe isto para obter valores em runtime — os valores
 * reais vivem no CSS e variam por tema (light/dark). Use apenas como
 * referência dos nomes dos tokens.
 */

// ─── Brand legado — alias diretos da paleta brand (não dependem de tema) ────
/**
 * Tokens brand-* são valores fixos da paleta SGS Blue.
 * Prefira os tokens ds-color-action-* que respondem ao dark mode.
 * Use brand-* apenas quando precisar de um valor fixo independente de tema
 * (ex: impressão em PDF, telas de login com fundo azul fixo).
 */
export const BrandRaw = {
  background:     "--brand-background",
  sidebar:        "--brand-sidebar",
  card:           "--brand-card",
  primary:        "--brand-primary",
  primaryHover:   "--brand-primary-hover",
  primaryActive:  "--brand-primary-active",
  primarySoft:    "--brand-primary-soft",
  focusRing:      "--brand-focus-ring",
  secondary:      "--brand-secondary",
  title:          "--brand-title",
  textPrimary:    "--brand-text-primary",
  textSecondary:  "--brand-text-secondary",
  textMuted:      "--brand-text-muted",
  borderDefault:  "--brand-border-default",
  borderStrong:   "--brand-border-strong",
  success:        "--brand-success",
  warning:        "--brand-warning",
  danger:         "--brand-danger",
  info:           "--brand-info",
} as const;

// ─── Escala Brand (azul SGS #1D5B8D) ─────────────────────────────────────────

export const ColorBrand = {
  50:  "--color-brand-50",
  100: "--color-brand-100",
  200: "--color-brand-200",
  300: "--color-brand-300",
  400: "--color-brand-400",
  500: "--color-brand-500",
  600: "--color-brand-600",
  700: "--color-brand-700",
  800: "--color-brand-800",
  900: "--color-brand-900",
} as const;

// ─── Escala Neutral ────────────────────────────────────────────────────────────

export const ColorNeutral = {
  50:  "--color-neutral-50",
  100: "--color-neutral-100",
  200: "--color-neutral-200",
  300: "--color-neutral-300",
  400: "--color-neutral-400",
  500: "--color-neutral-500",
  600: "--color-neutral-600",
  700: "--color-neutral-700",
  800: "--color-neutral-800",
  900: "--color-neutral-900",
} as const;

// ─── Cores de Status ───────────────────────────────────────────────────────────

export const ColorStatus = {
  success:       "--ds-color-success",
  successSubtle: "--ds-color-success-subtle",
  successBorder: "--ds-color-success-border",
  successFg:     "--ds-color-success-fg",
  successHover:  "--ds-color-success-hover",

  warning:       "--ds-color-warning",
  warningSubtle: "--ds-color-warning-subtle",
  warningBorder: "--ds-color-warning-border",
  warningFg:     "--ds-color-warning-fg",
  warningHover:  "--ds-color-warning-hover",

  danger:        "--ds-color-danger",
  dangerSubtle:  "--ds-color-danger-subtle",
  dangerBorder:  "--ds-color-danger-border",
  dangerFg:      "--ds-color-danger-fg",
  dangerHover:   "--ds-color-danger-hover",

  info:          "--ds-color-info",
  infoSubtle:    "--ds-color-info-subtle",
  infoBorder:    "--ds-color-info-border",
  infoFg:        "--ds-color-info-fg",
  infoHover:     "--ds-color-info-hover",
} as const;

// ─── Tokens de Ação (botões, links, interação primária) ───────────────────────

export const ColorAction = {
  primary:           "--ds-color-action-primary",
  primaryHover:      "--ds-color-action-primary-hover",
  primaryActive:     "--ds-color-action-primary-active",
  primaryForeground: "--ds-color-action-primary-foreground",
  primarySubtle:     "--ds-color-primary-subtle",
  primarySubtleHover:"--ds-color-primary-subtle-hover",

  secondary:           "--ds-color-action-secondary",
  secondaryHover:      "--ds-color-action-secondary-hover",
  secondaryForeground: "--ds-color-action-secondary-foreground",

  focus:    "--ds-color-focus",
  focusRing:"--ds-color-focus-ring",
} as const;

// ─── Tokens de Superfície ──────────────────────────────────────────────────────

export const ColorSurface = {
  canvas:     "--ds-color-bg-canvas",
  subtle:     "--ds-color-bg-subtle",
  base:       "--ds-color-surface-base",
  elevated:   "--ds-color-surface-elevated",
  muted:      "--ds-color-surface-muted",
  /** Variante hover da superfície muted — usado em listas e dropdowns */
  mutedHover: "--ds-color-surface-muted-hover",
  overlay:    "--ds-color-surface-overlay",
  sunken:     "--ds-color-surface-sunken",
} as const;

// ─── Tokens de Borda ──────────────────────────────────────────────────────────

export const ColorBorder = {
  subtle:  "--ds-color-border-subtle",
  default: "--ds-color-border-default",
  strong:  "--ds-color-border-strong",
  focus:   "--ds-color-border-focus",
  /** Borda específica para inputs (geralmente mais forte que default) */
  input:   "--ds-color-border-input",
} as const;

// ─── Tokens de Texto ──────────────────────────────────────────────────────────

export const ColorText = {
  primary:   "--ds-color-text-primary",
  secondary: "--ds-color-text-secondary",
  muted:     "--ds-color-text-muted",
  disabled:  "--ds-color-text-disabled",
  inverse:   "--ds-color-text-inverse",
  link:      "--ds-color-text-link",
  onCanvas:  "--ds-color-text-on-canvas",
} as const;

// ─── Tokens de Raio de Borda ──────────────────────────────────────────────────

export const Radius = {
  sm:   "--ds-radius-sm",
  md:   "--ds-radius-md",
  lg:   "--ds-radius-lg",
  xl:   "--ds-radius-xl",
  full: "--ds-radius-full",
} as const;

// ─── Tokens de Sombra ─────────────────────────────────────────────────────────

export const Shadow = {
  xs: "--ds-shadow-xs",
  sm: "--ds-shadow-sm",
  md: "--ds-shadow-md",
  lg: "--ds-shadow-lg",
  xl: "--ds-shadow-xl",
} as const;

// ─── Tokens de Tipografia ─────────────────────────────────────────────────────

export const TextSize = {
  "2xs": "--ds-text-2xs",
  xs:    "--ds-text-xs",
  sm:    "--ds-text-sm",
  md:    "--ds-text-md",
  lg:    "--ds-text-lg",
  xl:    "--ds-text-xl",
  "2xl": "--ds-text-2xl",
  "3xl": "--ds-text-3xl",
} as const;

export const LineHeight = {
  tight: "--ds-line-tight",
  base:  "--ds-line-base",
} as const;

export const FontFamily = {
  sans: "--font-sans",
  mono: "--font-mono",
} as const;

// ─── Tokens de Movimento ──────────────────────────────────────────────────────

export const Motion = {
  fast: "--ds-motion-fast",
  base: "--ds-motion-base",
  slow: "--ds-motion-slow",
} as const;

// ─── Tokens de Espaçamento ────────────────────────────────────────────────────

export const Space = {
  1: "--ds-space-1",
  2: "--ds-space-2",
  3: "--ds-space-3",
  4: "--ds-space-4",
  5: "--ds-space-5",
  6: "--ds-space-6",
  7: "--ds-space-7",
  8: "--ds-space-8",
} as const;

// ─── Tokens de Componente — Card ──────────────────────────────────────────────

export const ComponentCard = {
  bg:          "--component-card-bg",
  bgElevated:  "--component-card-bg-elevated",
  bgMuted:     "--component-card-bg-muted",
  border:      "--component-card-border",
  borderStrong:"--component-card-border-strong",
  shadow:      "--component-card-shadow",
  shadowEl:    "--component-card-shadow-elevated",
} as const;

// ─── Tokens de Componente — Button ────────────────────────────────────────────

export const ComponentButton = {
  primaryBg:      "--component-button-primary-bg",
  primaryHoverBg: "--component-button-primary-hover-bg",
  primaryText:    "--component-button-primary-text",
  secondaryBg:    "--component-button-secondary-bg",
  secondaryBorder:"--component-button-secondary-border",
  secondaryText:  "--component-button-secondary-text",
  ghostHoverBg:   "--component-button-ghost-bg-hover",
  dangerBg:       "--component-button-danger-bg",
  dangerText:     "--component-button-danger-text",
} as const;

// ─── Tokens de Componente — Badge ─────────────────────────────────────────────

export const ComponentBadge = {
  neutralBg:     "--component-badge-neutral-bg",
  neutralBorder: "--component-badge-neutral-border",
  neutralText:   "--component-badge-neutral-text",
  primaryBg:     "--component-badge-primary-bg",
  primaryText:   "--component-badge-primary-text",
  primaryBorder: "--component-badge-primary-border",
  shadow:        "--component-badge-shadow",
} as const;

// ─── Tokens de Componente — Field / Input ─────────────────────────────────────

export const ComponentField = {
  bg:           "--component-field-bg",
  bgSubtle:     "--component-field-bg-subtle",
  border:       "--component-field-border",
  borderSubtle: "--component-field-border-subtle",
  borderFocus:  "--component-field-border-focus",
  shadow:       "--component-field-shadow",
  shadowFocus:  "--component-field-shadow-focus",
  text:         "--component-field-text",
  placeholder:  "--component-field-placeholder",
} as const;

// ─── Tokens de Componente — Table ─────────────────────────────────────────────

export const ComponentTable = {
  bg:          "--component-table-bg",
  headerBg:    "--component-table-header-bg",
  headerText:  "--component-table-header-text",
  rowBorder:   "--component-table-row-border",
  rowHover:    "--component-table-row-hover",
  rowSelected: "--component-table-row-selected",
  shadow:      "--component-table-shadow",
  shellBorder: "--component-table-shell-border",
} as const;

// ─── Tokens de Componente — Modal ─────────────────────────────────────────────

export const ComponentModal = {
  overlay:    "--component-modal-overlay",
  bg:         "--component-modal-bg",
  border:     "--component-modal-border",
  shadow:     "--component-modal-shadow",
  footerBg:   "--component-modal-footer-bg",
  iconBg:     "--component-modal-icon-bg",
  iconBorder: "--component-modal-icon-border",
} as const;

// ─── Tokens de Risco (APR / Matriz de Riscos) ─────────────────────────────────

export const RiskColor = {
  negligible:    "--risk-negligible",
  acceptable:    "--risk-acceptable",
  attention:     "--risk-attention",
  substantial:   "--risk-substantial",
  critical:      "--risk-critical",
  acceptableFg:  "--risk-acceptable-fg",
  attentionFg:   "--risk-attention-fg",
  substantialFg: "--risk-substantial-fg",
  criticalFg:    "--risk-critical-fg",
  level1:        "--risk-level-1",
  level2:        "--risk-level-2",
  level3:        "--risk-level-3",
  level4:        "--risk-level-4",
  level5:        "--risk-level-5",
} as const;

// ─── Tokens de Chrome (sidebar / topbar) ──────────────────────────────────────

export const ChromeSidebar = {
  bg:              "--chrome-sidebar-bg",
  border:          "--chrome-sidebar-border",
  divider:         "--chrome-sidebar-divider",
  shadow:          "--chrome-sidebar-shadow",
  sectionText:     "--chrome-sidebar-section-text",
  itemHoverBg:     "--chrome-sidebar-item-hover-bg",
  itemActiveBg:    "--chrome-sidebar-item-active-bg",
  itemActiveBorder:"--chrome-sidebar-item-active-border",
  itemActiveIcon:  "--chrome-sidebar-item-active-icon",
  userCardBg:      "--chrome-sidebar-user-card-bg",
  userCardBorder:  "--chrome-sidebar-user-card-border",
} as const;

export const ChromeTopbar = {
  bg:         "--chrome-topbar-bg",
  border:     "--chrome-topbar-border",
  shadow:     "--chrome-topbar-shadow",
  chipBg:     "--chrome-topbar-chip-bg",
  chipBorder: "--chrome-topbar-chip-border",
  chipHoverBg:"--chrome-topbar-chip-hover-bg",
  keyBg:      "--chrome-topbar-key-bg",
  keyBorder:  "--chrome-topbar-key-border",
  keyText:    "--chrome-topbar-key-text",
  actionsBg:  "--chrome-topbar-actions-bg",
  userBg:     "--chrome-topbar-user-bg",
  userBorder: "--chrome-topbar-user-border",
} as const;

// ─── Tokens de Auth ────────────────────────────────────────────────────────────

export const AuthToken = {
  pageBg:           "--auth-page-bg",
  heroBg:           "--auth-hero-bg",
  heroText:         "--auth-hero-text",
  heroMuted:        "--auth-hero-muted",
  cardBg:           "--auth-card-bg",
  cardBorder:       "--auth-card-border",
  cardShadow:       "--auth-card-shadow",
  inputBg:          "--auth-input-bg",
  inputBorder:      "--auth-input-border",
  inputFocusRing:   "--auth-input-focus-ring",
  link:             "--auth-link",
  linkHover:        "--auth-link-hover",
  infoBg:           "--auth-info-bg",
  infoBorder:       "--auth-info-border",
  infoText:         "--auth-info-text",
  errorBg:          "--auth-error-bg",
  errorBorder:      "--auth-error-border",
  errorText:        "--auth-error-text",
} as const;

// ─── Tokens de Componente — List/Toolbar ──────────────────────────────────────

export const ComponentList = {
  shellBg:           "--component-list-shell-bg",
  shellBorder:       "--component-list-shell-border",
  toolbarBg:         "--component-list-toolbar-bg",
  toolbarBorder:     "--component-list-toolbar-border",
  toolbarSurfaceBg:  "--component-list-toolbar-surface-bg",
  footerBg:          "--component-list-footer-bg",
} as const;

export const ComponentSegmented = {
  bg:           "--component-segmented-bg",
  border:       "--component-segmented-border",
  activeBg:     "--component-segmented-active-bg",
  activeBorder: "--component-segmented-active-border",
  activeText:   "--component-segmented-active-text",
  text:         "--component-segmented-text",
  shadow:       "--component-segmented-shadow",
  activeShadow: "--component-segmented-active-shadow",
} as const;

// ─── Tokens de Page Header ────────────────────────────────────────────────────

export const ComponentPageHeader = {
  border:        "--component-page-header-border",
  kickerBg:      "--component-page-header-kicker-bg",
  kickerBorder:  "--component-page-header-kicker-border",
  kickerText:    "--component-page-header-kicker-text",
  accent:        "--component-page-header-accent",
} as const;

// ─── Aliases semânticos simplificados ─────────────────────────────────────────
/**
 * Aliases de alto nível para uso no código de produto.
 * Preferir estes em components novos — são os tokens mais estáveis.
 * São aliases definidos em tokens.css que apontam para os tokens ds-color-*.
 */

export const Semantic = {
  // Superfícies
  background:       "--color-background",
  backgroundSecondary: "--color-background-secondary",
  surface:          "--color-surface",
  surfaceElevated:  "--color-surface-elevated",
  surfaceOverlay:   "--color-surface-overlay",
  card:             "--color-card",
  cardMuted:        "--color-card-muted",
  sidebar:          "--color-sidebar",

  // Texto
  text:             "--color-text",
  textPrimary:      "--color-text-primary",
  textSecondary:    "--color-text-secondary",
  textMuted:        "--color-text-muted",
  textInverse:      "--color-text-inverse",

  // Borders
  border:           "--color-border",
  borderSubtle:     "--color-border-subtle",
  borderStrong:     "--color-border-strong",

  // Ações
  primary:          "--color-primary",
  primaryHover:     "--color-primary-hover",
  primaryActive:    "--color-primary-active",
  secondary:        "--color-secondary",
  secondaryHover:   "--color-secondary-hover",
  secondaryFg:      "--color-secondary-foreground",

  // Status
  success:          "--color-success",
  warning:          "--color-warning",
  danger:           "--color-danger",
  info:             "--color-info",
} as const;

// ─── Namespace unificado DesignToken ──────────────────────────────────────────
/**
 * Ponto de entrada único para todos os tokens do design system.
 * Recomendado para imports em código de produto.
 *
 * Exemplo:
 *   import { DesignToken } from '@/lib/tokens';
 *   <div style={{ color: css(DesignToken.text.primary) }} />
 */
export const DesignToken = {
  color: {
    brand:    ColorBrand,
    brandRaw: BrandRaw,
    neutral:  ColorNeutral,
    status:   ColorStatus,
    action:   ColorAction,
    surface:  ColorSurface,
    border:   ColorBorder,
    text:     ColorText,
    risk:     RiskColor,
  },
  semantic: Semantic,
  radius:   Radius,
  shadow:   Shadow,
  text:     TextSize,
  line:     LineHeight,
  font:     FontFamily,
  motion:   Motion,
  space:    Space,
  component: {
    card:       ComponentCard,
    button:     ComponentButton,
    badge:      ComponentBadge,
    field:      ComponentField,
    table:      ComponentTable,
    modal:      ComponentModal,
    list:       ComponentList,
    segmented:  ComponentSegmented,
    pageHeader: ComponentPageHeader,
  },
  chrome: {
    sidebar: ChromeSidebar,
    topbar:  ChromeTopbar,
  },
  auth: AuthToken,
} as const;

// ─── Helper — css() ───────────────────────────────────────────────────────────
/**
 * Retorna a sintaxe `var(--token)` para uso em `style` props do React.
 *
 * Exemplo:
 *   <div style={{ color: css(ColorText.primary) }} />
 *   // → <div style={{ color: "var(--ds-color-text-primary)" }} />
 */
export function css(token: string): string {
  return `var(${token})`;
}

/**
 * Retorna o valor atual de uma CSS custom property em runtime.
 * Útil para integração com bibliotecas de gráficos (Recharts, Chart.js).
 *
 * Exemplo:
 *   const blue = getCssVar(ColorAction.primary); // "#1d5b8d" em light mode
 */
export function getCssVar(
  token: string,
  element: Element = document.documentElement
): string {
  return getComputedStyle(element).getPropertyValue(token).trim();
}
