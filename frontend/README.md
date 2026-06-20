# BLACKBOX frontend

Next.js + TypeScript dashboard for the BLACKBOX confidential prediction market protocol. See the [root README](../README.md) for project context, the phase roadmap, and full setup instructions.

```bash
npm install
npm run dev
```

Fonts are self-hosted via Fontsource (`@fontsource/space-grotesk`, `@fontsource/geist-mono`) rather than `next/font/google`, so the app builds and runs without a live connection to Google Fonts.

FHE encryption and decryption run through `@zama-fhe/sdk` / `@zama-fhe/react-sdk` in a Web Worker, which requires the `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` headers set in `next.config.ts` -- don't remove them.
