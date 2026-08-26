/**
 * fixtures.mjs — fixture store for the version-aware stub server.
 *
 * Layout: fixtures/<lens>/<area>/<name>.json
 *
 * Every fixture carries:
 *   provenance  {kind: "CAPTURED" | "SYNTHETIC_PLACEHOLDER", ...}
 *   versions    release lenses the fixture is evidenced for
 *   request     {method, path, query?} to match
 *   response    {status, headers?, body?} to serve
 *   objectStructure (optional) — name used to validate the body against
 *                the captured JSON schema for its lens at startup
 *
 * The loader fails closed: a malformed fixture, a fixture whose directory
 * lens is missing from its own versions[], or a fixture whose body does not
 * match the captured schema for its object structure refuses startup.
 */

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { validateBodyAgainstSchema } from "./schema.mjs";

export class FixtureError extends Error {}

function listJsonFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listJsonFiles(full));
    else if (entry.endsWith(".json")) out.push(full);
  }
  return out;
}

function checkShape(fixture, file) {
  const fail = (msg) => {
    throw new FixtureError(`Invalid fixture ${file}: ${msg}`);
  };
  if (fixture?.provenance?.kind == null) fail("missing provenance.kind");
  if (!Array.isArray(fixture.versions) || fixture.versions.length === 0)
    fail("missing non-empty versions[]");
  if (typeof fixture?.request?.method !== "string") fail("missing request.method");
  if (typeof fixture?.request?.path !== "string" || !fixture.request.path.startsWith("/"))
    fail("request.path must be an absolute path");
  if (!Number.isInteger(fixture?.response?.status)) fail("missing integer response.status");
}

/**
 * Load all fixtures under fixturesDir, indexed by "METHOD pathname".
 * `dictionariesDir` (optional) enables startup schema validation.
 */
export function loadFixtures({ fixturesDir, dictionariesDir = null, log = () => {} }) {
  if (!existsSync(fixturesDir)) {
    throw new FixtureError(`Fixtures directory not found: ${fixturesDir}`);
  }
  const index = new Map(); // "GET /api/os/mxapiasset" -> [fixture]
  let count = 0;
  let syntheticCount = 0;

  for (const lensEntry of readdirSync(fixturesDir)) {
    const lensDir = join(fixturesDir, lensEntry);
    if (!statSync(lensDir).isDirectory()) continue;
    for (const file of listJsonFiles(lensDir)) {
      let fixture;
      try {
        fixture = JSON.parse(readFileSync(file, "utf8"));
      } catch (err) {
        throw new FixtureError(`Invalid fixture ${file}: not parseable JSON (${err.message})`);
      }
      checkShape(fixture, file);
      if (!fixture.versions.includes(lensEntry)) {
        throw new FixtureError(
          `Invalid fixture ${file}: stored under lens '${lensEntry}' but versions[] is ` +
            `[${fixture.versions.join(", ")}] — a fixture must be evidenced for the lens ` +
            "directory it lives in"
        );
      }
      fixture._file = relative(fixturesDir, file);
      validateAgainstDictionaries(fixture, dictionariesDir, file);

      const key = `${fixture.request.method.toUpperCase()} ${fixture.request.path}`;
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(fixture);
      count += 1;
      if (fixture.provenance.kind === "SYNTHETIC_PLACEHOLDER") syntheticCount += 1;
    }
  }

  // Deterministic match order: more-specific query matchers first.
  for (const list of index.values()) {
    list.sort(
      (a, b) =>
        Object.keys(b.request.query ?? {}).length - Object.keys(a.request.query ?? {}).length
    );
  }

  log(`Loaded ${count} fixture(s) (${syntheticCount} synthetic) from ${fixturesDir}`);
  return { index, count, syntheticCount };
}

function validateAgainstDictionaries(fixture, dictionariesDir, file) {
  if (!dictionariesDir || !fixture.objectStructure) return;
  for (const lens of fixture.versions) {
    const schemaPath = join(dictionariesDir, lens, "schemas", `${fixture.objectStructure}.json`);
    if (!existsSync(schemaPath)) continue; // no captured schema for this lens — nothing to check
    let schemaDoc;
    try {
      schemaDoc = JSON.parse(readFileSync(schemaPath, "utf8"));
    } catch (err) {
      throw new FixtureError(`Unreadable schema ${schemaPath}: ${err.message}`);
    }
    const schema = schemaDoc.payload ?? schemaDoc;
    const errors = validateBodyAgainstSchema(fixture.response.body, schema);
    if (errors.length > 0) {
      throw new FixtureError(
        `Fixture ${file} does not match the captured schema for ` +
          `${fixture.objectStructure} under lens '${lens}':\n  ${errors.join("\n  ")}`
      );
    }
  }
}

/** Subset match: every key/value the fixture demands must appear in the request query. */
function queryMatches(wanted, actual) {
  for (const [k, v] of Object.entries(wanted ?? {})) {
    if (actual.get(k) !== String(v)) return false;
  }
  return true;
}

/**
 * Resolve a request against the store for one lens.
 *
 * Returns one of:
 *   {kind: "hit", fixture}
 *   {kind: "wrong-lens", coveredLenses}   — evidence exists, not for this lens
 *   {kind: "miss"}                        — nothing matches method+path
 */
export function resolve(store, { method, pathname, query, lens }) {
  const candidates = store.index.get(`${method.toUpperCase()} ${pathname}`) ?? [];
  const pathMatches = candidates.filter((f) => queryMatches(f.request.query, query));
  if (pathMatches.length === 0) return { kind: "miss" };

  const hit = pathMatches.find((f) => f.versions.includes(lens));
  if (hit) return { kind: "hit", fixture: hit };

  const coveredLenses = [...new Set(pathMatches.flatMap((f) => f.versions))].sort();
  return { kind: "wrong-lens", coveredLenses };
}
