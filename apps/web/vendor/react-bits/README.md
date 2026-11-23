# React Bits (vendored)

Unmodified source from [reactbits.dev](https://reactbits.dev) registry, TS-CSS variant:

| Component     | Registry                                       |
| ------------- | ---------------------------------------------- |
| GhostFibers   | https://reactbits.dev/r/GhostFibers-TS-CSS.json |
| SpotlightCard | https://reactbits.dev/r/SpotlightCard-TS-CSS.json |

The app compiles with stricter flags (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
than upstream targets, so the source is kept here, compiled with upstream-level `strict`, and
the output (`.js`, `.d.ts`, `.css`) is written to `src/components/react-bits/`.

To update a component: replace its files here, then run `pnpm --filter @fomeora/web vendor:react-bits`.
Do not edit `src/components/react-bits/` by hand.
