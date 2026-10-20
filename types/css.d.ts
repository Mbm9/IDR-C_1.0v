// Ambient declaration for global CSS side-effect imports (e.g. `import './globals.css'`
// in app/layout.tsx). Without this, `tsc`/`next build` reports "Cannot find module or
// type declarations for side-effect import" under strict mode.
declare module '*.css';
