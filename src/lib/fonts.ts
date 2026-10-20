// Air-gapped friendly: no next/font/google (which fetches from Google at build/dev time and
// hangs in offline/restricted environments). Instead the brand typeface (IBM Plex Sans / Mono /
// Sans Arabic) is self-hosted from /public/fonts via @font-face in app/globals.css, and the
// --font-sans / --font-mono / --font-arabic CSS variables lead with it (system-stack fallback).
//
// These shims preserve the `.variable` className interface used by app/layout.tsx, so no other
// code needs to change. The classNames are intentionally empty — the variables live in :root.

export const plexSans = { variable: '' }
export const plexMono = { variable: '' }
export const plexArabic = { variable: '' }
