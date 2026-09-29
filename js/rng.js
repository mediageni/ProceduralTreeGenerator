// Seeded pseudo-random number generator + seed helpers.
// Deterministic: same seed -> same sequence -> same car. Browser-only, no deps.

// mulberry32: tiny, fast, good-enough 32-bit PRNG.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A fresh random uint32 seed (uses crypto when available, else Math.random).
export function randomSeed() {
  if (globalThis.crypto && crypto.getRandomValues) {
    return crypto.getRandomValues(new Uint32Array(1))[0] >>> 0;
  }
  return (Math.random() * 0xffffffff) >>> 0;
}

// uint32 <-> short human-friendly base36 string (what we show + put in ?seed=).
export const seedToString = (s) => (s >>> 0).toString(36).toUpperCase();
export function stringToSeed(str) {
  if (str == null) return null;
  const n = parseInt(String(str).trim(), 36);
  return Number.isFinite(n) ? n >>> 0 : null;
}

// Small helpers built on a 0..1 rng.
export const rng = {
  range: (r, lo, hi) => lo + (hi - lo) * r(),
  pick: (r, arr) => arr[Math.floor(r() * arr.length) % arr.length],
  chance: (r, p) => r() < p,
};
