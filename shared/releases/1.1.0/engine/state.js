import { STATE_VERSION } from "./version.js";
import { stringToSeed, randomSeed } from "./rng.js";
export const clone = (value) => structuredClone(value);
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// Retains the original UTF-8 base64 format and accepts URL-safe base64 too.
export function encodeConfig(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return btoa(
    Array.from(bytes, (b) => String.fromCharCode(b)).join(""),
  ).replace(/=+$/, "");
}
export function decodeConfig(encoded) {
  try {
    if (typeof encoded !== "string" || encoded.length > 24000) return null;
    const binary = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));
    const data = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        Uint8Array.from(binary, (c) => c.charCodeAt(0)),
      ),
    );
    return data && typeof data === "object" && !Array.isArray(data)
      ? data
      : null;
  } catch {
    return null;
  }
}

// Adapters provide preset samples and explicit overrides; runtime owns validation.
export function schemaFromSamples(samples, sliders, overrides = {}) {
  function visit(values) {
    const first = values.find((v) => v != null);
    if (typeof first === "number") {
      const nums = values.filter(
        (v) => typeof v === "number" && Number.isFinite(v),
      );
      return {
        type: "number",
        min: Math.min(...nums) < 0 ? -1000 : 0,
        max: Math.max(1, ...nums.map(Math.abs)) * 4,
      };
    }
    if (typeof first === "boolean") return { type: "boolean" };
    if (typeof first === "string")
      return { type: "enum", values: [...new Set(values)] };
    const fields = {};
    for (const key of new Set(
      values.flatMap((v) => (v && typeof v === "object" ? Object.keys(v) : [])),
    )) {
      if (["__proto__", "constructor", "prototype"].includes(key)) continue;
      fields[key] = visit(values.map((v) => v?.[key]));
    }
    return { type: "object", fields };
  }
  const fields = visit(samples).fields;
  fields.seed = { type: "number", min: 0, max: 4294967295, integer: true };
  for (const s of sliders.filter((s) => !s.derived)) {
    fields[s.key] = {
      type: "number",
      min: Math.min(s.min, fields[s.key]?.min ?? s.min),
      max: Math.max(s.max, fields[s.key]?.max ?? s.max),
    };
  }
  function hsl(rule, key) {
    if (rule?.type !== "object") return;
    if (["h", "s", "l"].every((k) => rule.fields[k]))
      for (const k of ["h", "s", "l"])
        rule.fields[k] = { type: "number", min: 0, max: 1 };
    else for (const [k, r] of Object.entries(rule.fields)) hsl(r, k);
  }
  hsl(fields.color);
  return { ...fields, ...overrides };
}
function validate(rule, input, fallback) {
  if (rule.type === "number") {
    if (typeof input !== "number" || !Number.isFinite(input)) return fallback;
    const n = clamp(input, rule.min, rule.max);
    return rule.integer ? Math.round(n) : n;
  }
  if (rule.type === "boolean")
    return typeof input === "boolean" ? input : fallback;
  if (rule.type === "enum")
    return rule.values.includes(input) ? input : fallback;
  const result = {};
  for (const [key, child] of Object.entries(rule.fields)) {
    const v = validate(child, input?.[key], fallback?.[key]);
    if (v !== undefined) result[key] = v;
  }
  return result;
}
export function normalizeParams(adapter, input, legacy = false) {
  const seed =
    Number.isInteger(input?.seed) && input.seed >= 0 && input.seed <= 4294967295
      ? input.seed
      : 0;
  const type = adapter.archetypes[input?.archetype]
    ? input.archetype
    : Object.keys(adapter.archetypes)[0];
  const fallback = adapter.enrich
    ? adapter.enrich(adapter.paramsFromSeed(seed, type), legacy)
    : adapter.paramsFromSeed(seed, type);
  const params = {};
  for (const [key, rule] of Object.entries(adapter.schema)) {
    const value = validate(rule, input?.[key], fallback[key]);
    if (value !== undefined) params[key] = value;
  }
  return params;
}
export function normalizeState(adapter, input) {
  if (!input || typeof input !== "object")
    throw new Error("This configuration is not valid.");
  const legacy = input.v == null;
  if (!legacy && (input.v !== STATE_VERSION || input.generator !== adapter.id))
    throw new Error(
      "This link belongs to another generator or a newer configuration version.",
    );
  const params = normalizeParams(
    adapter,
    legacy ? input : input.params,
    legacy,
  );
  const validLocks = new Set([
    "archetype",
    "look",
    "palette",
    "color",
    ...adapter.sliders.map((s) => s.key),
    ...(adapter.options ?? []).map((s) => s.key),
  ]);
  return {
    v: STATE_VERSION,
    generator: adapter.id,
    params,
    look: adapter.styles[input.look] ? input.look : adapter.defaultLook,
    palette: ["original", "cozy", "modern", "winter"].includes(input.palette)
      ? input.palette
      : "original",
    locks: Array.isArray(input.locks)
      ? [...new Set(input.locks.filter((key) => validLocks.has(key)))].slice(
          0,
          64,
        )
      : [],
  };
}
export function initialState(adapter, search, saved) {
  const query = new URLSearchParams(search);
  const encoded = query.get("c");
  if (encoded) {
    const decoded = decodeConfig(encoded);
    if (!decoded)
      throw new Error(
        "This share link is damaged. Open a fresh generator to start again.",
      );
    return normalizeState(adapter, decoded);
  }
  if (!query.has("seed") && !query.has("type") && saved) {
    try {
      return normalizeState(adapter, saved);
    } catch {
      /* older stored state falls back to a fresh model */
    }
  }
  const seed = stringToSeed(query.get("seed")) ?? randomSeed();
  const params = adapter.paramsFromSeed(
    seed,
    query.get("type") ||
      (query.has("seed")
        ? adapter.defaultType
        : adapter.firstType || adapter.defaultType),
  );
  return normalizeState(adapter, {
    v: STATE_VERSION,
    generator: adapter.id,
    params: adapter.enrich ? adapter.enrich(params) : params,
    look: query.get("look") || adapter.defaultLook,
    palette: query.get("palette"),
  });
}
export class StateHistory {
  constructor(state) {
    this.current = clone(state);
    this.past = [];
    this.future = [];
    this.group = null;
  }
  begin() {
    if (!this.group) this.group = clone(this.current);
  }
  end() {
    if (
      this.group &&
      JSON.stringify(this.group) !== JSON.stringify(this.current)
    )
      this.push(this.group);
    this.group = null;
  }
  push(state) {
    this.past.push(clone(state));
    if (this.past.length > 80) this.past.shift();
    this.future = [];
  }
  set(state) {
    if (JSON.stringify(state) === JSON.stringify(this.current)) return false;
    if (!this.group) this.push(this.current);
    this.current = clone(state);
    return true;
  }
  undo() {
    this.end();
    if (!this.past.length) return false;
    this.future.push(clone(this.current));
    this.current = this.past.pop();
    return true;
  }
  redo() {
    if (!this.future.length) return false;
    this.past.push(clone(this.current));
    this.current = this.future.pop();
    return true;
  }
}
export function retainLocks(adapter, oldState, nextState) {
  const next = clone(nextState);
  for (const key of oldState.locks) {
    if (key === "archetype") continue;
    if (key === "look" || key === "palette") next[key] = oldState[key];
    else if (key === "color") next.params.color = clone(oldState.params.color);
    else if (adapter.sliders.find((s) => s.key === key)?.derived) {
      const spec = adapter.sliders.find((s) => s.key === key);
      if (spec.lockFields)
        for (const field of spec.lockFields)
          next.params[field] = clone(oldState.params[field]);
      else
        adapter.setDerived(
          next.params,
          key,
          adapter.getDerived(oldState.params, key),
        );
    } else if (oldState.params[key] !== undefined)
      next.params[key] = clone(oldState.params[key]);
  }
  next.locks = [...oldState.locks];
  return normalizeState(adapter, next);
}
