//* Captured as early as possible so startup timing reflects the true
//* process start. This must be imported as the very first line of
//* index.ts — before "./env" — to stay accurate.
export const processStartedAt = Date.now()