import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { createStubServer, parseArgs } from "../server.mjs";
import { FixtureError, loadFixtures } from "../lib/fixtures.mjs";
import { validate, validateBodyAgainstSchema } from "../lib/schema.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "..", "fixtures");
const DICTIONARIES = join(HERE, "..", "..", "dictionaries", "_synthetic");

let servers = [];
async function start(opts) {
  const { server } = createStubServer({
    fixturesDir: FIXTURES,
    dictionariesDir: DICTIONARIES,
    ...opts,
  });
  await new Promise((r) => server.listen(0, r));
  servers.push(server);
  return `http://localhost:${server.address().port}`;
}
after(() => servers.forEach((s) => s.close()));

async function call(base, path, headers = {}) {
  const res = await fetch(`${base}${path}`, { headers });
  const body = await res.json().catch(() => null);
  return { status: res.status, headers: res.headers, body };
}

test("serves the fixture evidenced for the requested lens, per request header", async () => {
  const base = await start({ allowSynthetic: true });

  const v91 = await call(base, "/api/os/mxapiasset", { "x-version-lens": "9.1" });
  assert.equal(v91.status, 200);
  assert.equal(v91.body.member.length, 2);
  assert.ok(!("assettype" in v91.body.member[0]), "9.1 must not leak the 9.2-only field");
  assert.equal(v91.headers.get("x-stub-lens"), "9.1");
  assert.equal(v91.headers.get("x-stub-provenance"), "SYNTHETIC_PLACEHOLDER");

  const v92 = await call(base, "/api/os/mxapiasset", { "x-version-lens": "9.2" });
  assert.equal(v92.status, 200);
  assert.equal(v92.body.member[0].assettype, "PRODUCTION");
});

test("fails closed with 409 NO_FIXTURE_FOR_VERSION naming the covered lenses", async () => {
  const base = await start({ allowSynthetic: true });
  const res = await call(base, "/api/os/mxapiasset", { "x-version-lens": "7.6.1" });
  assert.equal(res.status, 409);
  assert.equal(res.body.error, "NO_FIXTURE_FOR_VERSION");
  assert.equal(res.body.requestedLens, "7.6.1");
  assert.deepEqual(res.body.coveredLenses, ["9.1", "9.2"]);
  assert.match(res.body.detail, /do not reuse another lens's response/);
});

test("refuses SYNTHETIC_PLACEHOLDER fixtures unless --allow-synthetic", async () => {
  const base = await start({ allowSynthetic: false });
  const res = await call(base, "/oslc/systeminfo", { "x-version-lens": "9.1" });
  assert.equal(res.status, 403);
  assert.equal(res.body.error, "SYNTHETIC_FIXTURE_BLOCKED");
  assert.match(res.body.detail, /--allow-synthetic/);
});

test("falls back to the server-start lens; 400 when no lens is selected at all", async () => {
  const base = await start({ allowSynthetic: true, defaultLens: "9.2" });
  const viaDefault = await call(base, "/oslc/systeminfo");
  assert.equal(viaDefault.status, 200);
  assert.equal(viaDefault.body.version, "SYNTHETIC-9.2");

  const noLens = await start({ allowSynthetic: true });
  const res = await call(noLens, "/oslc/systeminfo");
  assert.equal(res.status, 400);
  assert.equal(res.body.error, "NO_LENS_SELECTED");
});

test("unknown request gets an explicit 404, not an improvised response", async () => {
  const base = await start({ allowSynthetic: true });
  const res = await call(base, "/api/os/mxapinonesuch", { "x-version-lens": "9.1" });
  assert.equal(res.status, 404);
  assert.equal(res.body.error, "NO_FIXTURE_FOR_REQUEST");
});

test("negative shapes ride along: shared 404 and 429 fixtures serve for both lenses", async () => {
  const base = await start({ allowSynthetic: true });
  for (const lens of ["9.1", "9.2"]) {
    const nf = await call(base, "/api/os/mxapiasset/99999", { "x-version-lens": lens });
    assert.equal(nf.status, 404);
    assert.equal(nf.body.Error.reasonCode, "NOT_FOUND");

    const rl = await call(base, "/api/os/mxapiwo", { "x-version-lens": lens });
    assert.equal(rl.status, 429);
    assert.equal(rl.headers.get("retry-after"), "5");
  }
});

test("status endpoint reports coverage", async () => {
  const base = await start({ allowSynthetic: true, defaultLens: "9.1" });
  const res = await call(base, "/__stub/status");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.coveredLenses, ["9.1", "9.2"]);
  assert.equal(res.body.fixtures, 6);
});

function writeFixtureTree(files) {
  const root = mkdtempSync(join(tmpdir(), "stub-fx-"));
  for (const [rel, doc] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, JSON.stringify(doc));
  }
  return root;
}

const GOOD = {
  provenance: { kind: "SYNTHETIC_PLACEHOLDER" },
  versions: ["9.1"],
  objectStructure: "MXAPIASSET",
  request: { method: "GET", path: "/api/os/mxapiasset" },
  response: { status: 200, body: { member: [{ assetnum: "1", siteid: "X" }] } },
};

test("startup refuses a fixture that violates the captured schema for its lens", () => {
  const bad = structuredClone(GOOD);
  bad.response.body.member[0] = { description: "missing required assetnum/siteid" };
  const root = writeFixtureTree({ "9.1/os/bad.json": bad });
  assert.throws(
    () => loadFixtures({ fixturesDir: root, dictionariesDir: DICTIONARIES }),
    (err) =>
      err instanceof FixtureError &&
      /does not match the captured schema/.test(err.message) &&
      /missing required property 'assetnum'/.test(err.message)
  );
});

test("startup refuses a fixture stored under a lens its versions[] does not claim", () => {
  const bad = structuredClone(GOOD); // versions ["9.1"] but stored under 9.2/
  const root = writeFixtureTree({ "9.2/os/bad.json": bad });
  assert.throws(
    () => loadFixtures({ fixturesDir: root, dictionariesDir: DICTIONARIES }),
    /must be evidenced for the lens directory it lives in/
  );
});

test("startup refuses malformed fixtures", () => {
  const noVersions = structuredClone(GOOD);
  delete noVersions.versions;
  const root = writeFixtureTree({ "9.1/os/bad.json": noVersions });
  assert.throws(() => loadFixtures({ fixturesDir: root }), /non-empty versions\[\]/);
});

test("schema validator: types, required, nested, nullability", () => {
  const schema = {
    type: "object",
    properties: { a: { type: "string" }, n: { type: "integer" } },
    required: ["a"],
  };
  assert.deepEqual(validate({ a: "x", n: 3 }, schema), []);
  assert.match(validate({ a: 1 }, schema)[0], /expected type string/);
  assert.match(validate({}, schema)[0], /missing required property 'a'/);
  assert.deepEqual(validate({ a: "x", n: null }, schema), [], "null accepted (nullability)");
  assert.match(
    validateBodyAgainstSchema({ member: [{ a: "x" }, {}] }, schema)[0],
    /member\[1\]: missing required property 'a'/
  );
});

test("parseArgs: flags parse and junk is rejected", () => {
  const a = parseArgs(["--port", "8123", "--lens", "9.1", "--allow-synthetic"]);
  assert.equal(a.port, 8123);
  assert.equal(a.defaultLens, "9.1");
  assert.equal(a.allowSynthetic, true);
  assert.throws(() => parseArgs(["--bogus"]), /Unknown option/);
  assert.throws(() => parseArgs(["--port", "banana"]), /Invalid --port/);
});
