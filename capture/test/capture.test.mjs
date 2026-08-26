import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  capture,
  parseArgs,
  readCredentials,
  extractBuildString,
  extractRoster,
  sha256,
} from "../capture.mjs";

const ENV = { MAXIMO_BASE_URL: "https://maximo.test.invalid/maximo", MAXIMO_APIKEY: "test-key" };

/** Build a fake fetch serving canned GET responses, recording every call. */
function fakeFetch(routes, calls) {
  return async (url, init) => {
    calls.push({ url, method: init?.method, headers: init?.headers });
    const path = new URL(url).pathname.replace(/^\/maximo/, "");
    const hit = routes[path];
    if (!hit) {
      return { ok: false, status: 404, text: async () => `no route for ${path}` };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify(hit) };
  };
}

const ROUTES = {
  "/oslc/systeminfo": { version: "MAS 9.1.0-synthetic-test" },
  "/oslc/apimeta": { apis: ["os", "oslc"] },
  "/api/os/mxintobject": {
    member: [{ intobjectname: "MXAPIASSET" }, { intobjectname: "MXAPIWO" }],
  },
  "/oslc/jsonschemas/mxapiasset": {
    properties: { assetnum: { type: "string" } },
    required: ["assetnum"],
  },
  "/oslc/jsonschemas/mxapiwo": { properties: { wonum: { type: "string" } } },
  "/api/os/mxobjectcfg": { member: [{ objectname: "ASSET", attributes: [] }] },
};

test("readCredentials fails with a clear message when env is unset", () => {
  assert.throws(() => readCredentials({}), /MAXIMO_BASE_URL, MAXIMO_APIKEY/);
  assert.throws(() => readCredentials({ MAXIMO_BASE_URL: "x" }), /MAXIMO_APIKEY/);
});

test("parseArgs handles lens, --refresh and --out; rejects junk", () => {
  assert.deepEqual(parseArgs(["9.1"]), { lens: "9.1", refresh: false, outDir: "dictionaries" });
  assert.deepEqual(parseArgs(["9.2", "--refresh", "--out", "d"]), {
    lens: "9.2",
    refresh: true,
    outDir: "d",
  });
  assert.throws(() => parseArgs([]), /Missing <lens>/);
  assert.throws(() => parseArgs(["9.1", "--bogus"]), /Unknown option/);
});

test("extractBuildString and extractRoster tolerate shape variation", () => {
  assert.equal(extractBuildString({ version: "9.2.0" }), "9.2.0");
  assert.equal(extractBuildString({ member: [{ version: "7.6.1.3" }] }), "7.6.1.3");
  assert.equal(extractBuildString({}), "UNKNOWN");
  assert.deepEqual(extractRoster({ member: [{ intobjectname: "b" }, { name: "A" }] }), ["A", "B"]);
  assert.deepEqual(extractRoster({}), []);
});

test("capture writes provenance-wrapped dictionaries and only ever issues GETs", async () => {
  const out = mkdtempSync(join(tmpdir(), "cap-"));
  const calls = [];
  const result = await capture({
    lens: "9.1",
    outDir: out,
    env: ENV,
    fetchImpl: fakeFetch(ROUTES, calls),
    log: () => {},
  });

  assert.equal(result.buildString, "MAS 9.1.0-synthetic-test");
  assert.deepEqual(result.osNames, ["MXAPIASSET", "MXAPIWO"]);
  assert.equal(result.schemaCount, 2);

  // Read-only invariant: every recorded HTTP call was a GET with the apikey header.
  assert.ok(calls.length >= 5);
  for (const c of calls) {
    assert.equal(c.method, "GET");
    assert.equal(c.headers.apikey, "test-key");
  }

  // Files exist and carry a correct provenance header.
  for (const f of ["systeminfo.json", "apimeta.json", "mxintobject.json", "mxobjectcfg.json"]) {
    assert.ok(existsSync(join(out, "9.1", f)), `${f} missing`);
  }
  const si = JSON.parse(readFileSync(join(out, "9.1", "systeminfo.json"), "utf8"));
  assert.equal(si._provenance.kind, "CAPTURED");
  assert.equal(si._provenance.sourceHost, "maximo.test.invalid");
  assert.equal(si._provenance.buildString, "MAS 9.1.0-synthetic-test");
  assert.equal(si._provenance.sha256, sha256(JSON.stringify(ROUTES["/oslc/systeminfo"])));
  assert.deepEqual(si.payload, ROUTES["/oslc/systeminfo"]);

  const schema = JSON.parse(readFileSync(join(out, "9.1", "schemas", "MXAPIASSET.json"), "utf8"));
  assert.deepEqual(schema.payload.required, ["assetnum"]);
});

test("capture refuses to overwrite a lens whose build string differs, unless --refresh", async () => {
  const out = mkdtempSync(join(tmpdir(), "cap-"));
  const lensDir = join(out, "9.1");
  mkdirSync(lensDir, { recursive: true });
  writeFileSync(
    join(lensDir, "systeminfo.json"),
    JSON.stringify({ _provenance: { buildString: "SOME OTHER BUILD" }, payload: {} })
  );

  await assert.rejects(
    capture({ lens: "9.1", outDir: out, env: ENV, fetchImpl: fakeFetch(ROUTES, []), log: () => {} }),
    /Refusing to overwrite lens '9\.1'.*--refresh/s
  );

  // With --refresh the same capture succeeds.
  const result = await capture({
    lens: "9.1",
    refresh: true,
    outDir: out,
    env: ENV,
    fetchImpl: fakeFetch(ROUTES, []),
    log: () => {},
  });
  assert.equal(result.buildString, "MAS 9.1.0-synthetic-test");
});

test("capture rejects an invalid lens label before touching the network", async () => {
  let touched = false;
  await assert.rejects(
    capture({
      lens: "../evil",
      env: ENV,
      fetchImpl: async () => {
        touched = true;
        throw new Error("should not be called");
      },
    }),
    /Invalid lens label/
  );
  assert.equal(touched, false);
});

test("source code contains no write-method code path", () => {
  const src = readFileSync(new URL("../capture.mjs", import.meta.url), "utf8");
  for (const verb of ['"POST"', '"PUT"', '"PATCH"', '"DELETE"']) {
    assert.ok(!src.includes(verb), `capture.mjs must not reference ${verb}`);
  }
});
