#!/usr/bin/env node
/**
 * capture.mjs — Metadata capture pipeline for a Maximo/MAS version lens.
 *
 * Captures, read-only, from a live Maximo/MAS instance:
 *   - /oslc/systeminfo            (provenance / build string)
 *   - /oslc/apimeta               (API metadata)
 *   - /api/os/mxintobject         (object structure roster)
 *   - /oslc/jsonschemas/{os}      (JSON schema per rostered object structure)
 *   - /api/os/mxobjectcfg         (attribute dictionary)
 *
 * and writes them under dictionaries/<lens>/, each file wrapped in a
 * provenance header (source host, capture date, systeminfo build string,
 * sha256 of the raw response body).
 *
 * Credentials come from the environment ONLY:
 *   MAXIMO_BASE_URL  e.g. https://maximo.example.com/maximo
 *   MAXIMO_APIKEY    sent as the `apikey` header
 *
 * Usage:
 *   MAXIMO_BASE_URL=... MAXIMO_APIKEY=... node capture/capture.mjs <lens> [--refresh] [--out <dir>]
 *
 * The tool is structurally read-only: every request goes through get(),
 * which hard-codes the GET method. There is no code path that issues a
 * POST, PUT, PATCH or DELETE.
 */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const USAGE =
  "Usage: MAXIMO_BASE_URL=... MAXIMO_APIKEY=... node capture/capture.mjs <lens> [--refresh] [--out <dir>]";

const LENS_PATTERN = /^[0-9][0-9A-Za-z.\-]{0,31}$/;

export function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Read credentials from the environment; throw a clear error if unset. */
export function readCredentials(env = process.env) {
  const baseUrl = env.MAXIMO_BASE_URL;
  const apiKey = env.MAXIMO_APIKEY;
  const missing = [];
  if (!baseUrl) missing.push("MAXIMO_BASE_URL");
  if (!apiKey) missing.push("MAXIMO_APIKEY");
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}.\n` +
        "Credentials are accepted from the environment only — never as CLI arguments or config files.\n" +
        USAGE
    );
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}

/**
 * Issue a read-only GET. The method is hard-coded: this function is the
 * only place the tool talks HTTP, and it is structurally unable to write.
 */
async function get(creds, path, fetchImpl) {
  const url = `${creds.baseUrl}${path}`;
  const res = await fetchImpl(url, {
    method: "GET",
    headers: { apikey: creds.apiKey, accept: "application/json" },
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`GET ${path} failed: HTTP ${res.status} ${raw.slice(0, 300)}`);
  }
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error(`GET ${path} returned non-JSON content (first bytes: ${raw.slice(0, 80)})`);
  }
  return { raw, payload };
}

/** Extract a build/version string from a systeminfo payload, best-effort across shapes. */
export function extractBuildString(systeminfo) {
  if (systeminfo == null || typeof systeminfo !== "object") return "UNKNOWN";
  const direct =
    systeminfo.maxupg ??
    systeminfo.version ??
    systeminfo.build ??
    systeminfo.mxversion ??
    null;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  // Common MAS shape: an array of product entries with version info.
  const members = systeminfo.member ?? systeminfo.products ?? null;
  if (Array.isArray(members)) {
    for (const m of members) {
      const v = m?.version ?? m?.build ?? null;
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return "UNKNOWN";
}

/** Extract object structure names from an mxintobject roster payload. */
export function extractRoster(rosterPayload) {
  const members = rosterPayload?.member ?? [];
  const names = [];
  for (const m of members) {
    const name = m?.intobjectname ?? m?.name ?? null;
    if (typeof name === "string" && name.trim()) names.push(name.trim().toUpperCase());
  }
  return [...new Set(names)].sort();
}

function provenanceHeader({ sourceHost, buildString, raw, kind = "CAPTURED", now }) {
  return {
    kind,
    sourceHost,
    captureDate: (now ?? new Date()).toISOString(),
    buildString,
    sha256: sha256(raw),
  };
}

/** Read an existing lens directory's recorded build string, or null. */
export function existingBuildString(lensDir, fs = { readFileSync, existsSync }) {
  const p = join(lensDir, "systeminfo.json");
  if (!fs.existsSync(p)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf8"));
    return parsed?._provenance?.buildString ?? null;
  } catch {
    return null;
  }
}

/**
 * Run a full capture for one lens.
 *
 * Injectable dependencies (fetchImpl, fs, now, log) keep this testable
 * offline; the CLI wires in the real ones.
 */
export async function capture({
  lens,
  refresh = false,
  outDir = "dictionaries",
  env = process.env,
  fetchImpl = fetch,
  fs = { mkdirSync, writeFileSync, readFileSync, existsSync },
  now,
  log = console.error,
}) {
  if (!LENS_PATTERN.test(lens ?? "")) {
    throw new Error(
      `Invalid lens label '${lens}'. Use a short version label such as 9.1, 9.2 or 7.6.1.\n${USAGE}`
    );
  }
  const creds = readCredentials(env);
  const sourceHost = new URL(creds.baseUrl).host;
  const lensDir = join(outDir, lens);

  // 1. systeminfo first: it provides the build string every other file's
  //    provenance carries, and drives the overwrite guard.
  const systeminfo = await get(creds, "/oslc/systeminfo", fetchImpl);
  const buildString = extractBuildString(systeminfo.payload);

  const previous = existingBuildString(lensDir, fs);
  if (previous !== null && previous !== buildString && !refresh) {
    throw new Error(
      `Refusing to overwrite lens '${lens}': existing capture was taken from build ` +
        `'${previous}', but this instance reports '${buildString}'. ` +
        "If the lens really should be re-based on this instance, re-run with --refresh."
    );
  }

  const writeDoc = (relPath, doc) => {
    const full = join(lensDir, relPath);
    fs.mkdirSync(join(full, ".."), { recursive: true });
    fs.writeFileSync(full, JSON.stringify(doc, null, 2) + "\n");
    log(`  wrote ${full}`);
  };
  const wrap = (raw, payload) => ({
    _provenance: provenanceHeader({ sourceHost, buildString, raw, now }),
    payload,
  });

  writeDoc("systeminfo.json", wrap(systeminfo.raw, systeminfo.payload));

  // 2. apimeta
  const apimeta = await get(creds, "/oslc/apimeta", fetchImpl);
  writeDoc("apimeta.json", wrap(apimeta.raw, apimeta.payload));

  // 3. object structure roster
  const roster = await get(creds, "/api/os/mxintobject", fetchImpl);
  writeDoc("mxintobject.json", wrap(roster.raw, roster.payload));
  const osNames = extractRoster(roster.payload);
  log(`  roster: ${osNames.length} object structure(s)`);

  // 4. per-object-structure JSON schema
  let schemaCount = 0;
  for (const os of osNames) {
    try {
      const schema = await get(creds, `/oslc/jsonschemas/${os.toLowerCase()}`, fetchImpl);
      writeDoc(join("schemas", `${os}.json`), wrap(schema.raw, schema.payload));
      schemaCount += 1;
    } catch (err) {
      // A rostered structure without a published schema is a fact worth
      // recording, not a reason to abort the whole capture.
      log(`  schema unavailable for ${os}: ${err.message}`);
    }
  }

  // 5. attribute dictionary
  const objectcfg = await get(creds, "/api/os/mxobjectcfg", fetchImpl);
  writeDoc("mxobjectcfg.json", wrap(objectcfg.raw, objectcfg.payload));

  return { lens, lensDir, buildString, osNames, schemaCount };
}

export function parseArgs(argv) {
  const args = { lens: null, refresh: false, outDir: "dictionaries" };
  const rest = [...argv];
  while (rest.length > 0) {
    const a = rest.shift();
    if (a === "--refresh") args.refresh = true;
    else if (a === "--out") args.outDir = rest.shift() ?? args.outDir;
    else if (a.startsWith("--")) throw new Error(`Unknown option '${a}'.\n${USAGE}`);
    else if (args.lens === null) args.lens = a;
    else throw new Error(`Unexpected argument '${a}'.\n${USAGE}`);
  }
  if (args.lens === null) throw new Error(`Missing <lens> argument.\n${USAGE}`);
  return args;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = await capture(args);
    console.error(
      `Captured lens '${result.lens}' (build '${result.buildString}') into ${result.lensDir}: ` +
        `${result.osNames.length} object structures, ${result.schemaCount} schemas.`
    );
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
}
