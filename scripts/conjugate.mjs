// The engine lives in src/ so the Worker and the build scripts cannot drift
// apart. This shim keeps the old import path working.
export { conjugate, IRREGULAR_VERBS } from '../src/conjugate.js';
