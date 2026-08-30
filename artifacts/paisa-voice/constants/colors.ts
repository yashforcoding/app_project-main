/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: '#11202b',
    tint: '#127c68',

    // Core surfaces
    background: '#f7f8f4',
    foreground: '#11202b',

    // Cards / elevated surfaces
    card: '#ffffff',
    cardForeground: '#11202b',

    // Primary action color (buttons, links, active states)
    primary: '#127c68',
    primaryForeground: '#ffffff',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#e7efeb',
    secondaryForeground: '#184f44',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#e8ece8',
    mutedForeground: '#6f7e79',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#f0b84b',
    accentForeground: '#11202b',

    // Destructive actions (delete, error states)
    destructive: '#b84c4c',
    destructiveForeground: '#ffffff',

    // Borders and input outlines
    border: '#e0e6e1',
    input: '#d4ddd7',
    placeholder: '#91a099',
    primarySoft: '#e3f1ec',
    success: '#16805f',
    successSoft: '#e3f3ed',
    errorSoft: '#f8e8e6',
    ink: '#112d2b',
    inkMuted: '#a8c3b8',
    gold: '#f4c15d',
    inkAccent: '#27544c',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 8,
};

export default colors;
