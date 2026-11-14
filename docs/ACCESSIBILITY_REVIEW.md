# Accessibility Review (WCAG 2.1 / 2.2 AA)

## Semantic Structure & Keyboard Navigation

- **Skip Link**: `Layout.tsx` renders a keyboard-focusable "Skip to main content" link targeting `<main id="main-content">`.
- **Landmarks & Headings**: Semantic `<aside>`, `<header>`, `<nav aria-label="...">`, `<main>`, `<section>`, `<article>`, and sequential heading hierarchy (`h1` -> `h2` -> `h3`) on every screen.
- **Dialogs & Drawers**: Modals (`EvidenceDrawer`, Grounded Prompt Payload modal, Mobile Navigation Drawer) apply `role="dialog"`, `aria-modal="true"`, `aria-labelledby` / `aria-label`, and `Escape` key dismissal (`EvidenceDrawer.tsx`).
- **Live Announcements**: Toast feedback container uses `aria-live="polite" aria-atomic="true"` and `role="alert"` for errors.

## Color Independence & Readability

- **Icon + Label + Numeric Badges**: `AqiStatusIndicator` and `ReliabilityIndicator` never rely on color alone — every state combines an explicit Lucide icon (`CheckCircle2`, `Eye`, `AlertTriangle`, `OctagonAlert`, `ShieldAlert`, `HelpCircle`) with human-readable status text and `tabular-nums` monospace AQI values.
- **Non-Chart Tabular Fallbacks**: Both the Command Center and Radar/Projection screens provide accessible HTML `<table>` equivalents with proper `<th>` headers alongside visual summaries.
- **Speech Synthesis & Plain-Language Modes**: `CitizenAdvisoryPage.tsx` provides 3 reading levels (`Simple Public (Grade 5)`, `Child-Friendly School Story`, `Detailed Health & Civic Notice`), dedicated sections for children, older adults, and sensitive groups, and browser `window.speechSynthesis` Listen/Pause/Stop controls with explicit fallback notice when a local regional voice is unavailable.
- **Print Poster Support**: `@media print` rules in `src/index.css` and `.no-print` classes hide navigation chrome so printed advisories and briefings remain clean and high-contrast.
