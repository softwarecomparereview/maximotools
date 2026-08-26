#!/usr/bin/env node
/**
 * server.mjs — version-aware HTTP stub server for Maximo/MAS APIs.
 *
 * Serves fixtures from fixtures/<lens>/<area>/<name>.json. The version lens
 * is selected per request via the `x-version-lens` header, falling back to
 * the --lens flag the server was started with.
 *
 * Fail-closed rules (see the field guide):
 *   - a request for a lens with no evidenced fixture returns
 *     409 NO_FIXTURE_FOR_VERSION, naming the lenses evidence covers;
 *   - a SYNTHETIC_PLACEHOLDER fixture is refused unless the server was
 *     started with --allow-synthetic (403 SYNTHETIC_FIXTURE_BLOCKED);
 *   - fixtures are validated against captured JSON schemas at startup, and
 *     the server refuses to start on a mismatch.
 *
 * Usage:
 *   node stub/server.mjs [--port 8009] [--lens 9.1] [--allow-synthetic]
 *                        [--fixtures stub/fixtures] [--dictionaries dictionaries]
 */

import { createServer as createHttpServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadFixtures, resolve, FixtureError } from "./lib/fixtures.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

export const USAGE =
  "Usage: node stub/server.mjs [--port N] [--lens LABEL] [--allow-synthetic] " +
  "[--fixtures DIR] [--dictionaries DIR]";

function json(res, status, body) {
  const text = JSON.stringify(body, null, 2);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(text) });
  res.end(text);
}

/**
 * Build (but do not listen) an HTTP stub server over a loaded fixture store.
 * Exported for tests, which start it on an ephemeral port.
 */
export function createStubServer({
  fixturesDir = join(HERE, "fixtures"),
  dictionariesDir = join(HERE, "..", "dictionaries", "_synthetic"),
  defaultLens = null,
  allowSynthetic = false,
  log = () => {},
} = {}) {
  const store = loadFixtures({ fixturesDir, dictionariesDir, log });

  const server = createHttpServer((req, res) => {
    const url = new URL(req.url, "http://stub.local");

    if (req.method === "GET" && url.pathname === "/__stub/status") {
      const lenses = [...new Set([...store.index.values()].flat().flatMap((f) => f.versions))];
      return json(res, 200, {
        fixtures: store.count,
        synthetic: store.syntheticCount,
        allowSynthetic,
        defaultLens,
        coveredLenses: lenses.sort(),
      });
    }

    const lens = req.headers["x-version-lens"] ?? defaultLens;
    if (!lens) {
      return json(res, 400, {
        error: "NO_LENS_SELECTED",
        detail:
          "Select a version lens with the x-version-lens request header, or start the server with --lens.",
      });
    }

    const outcome = resolve(store, {
      method: req.method,
      pathname: url.pathname,
      query: url.searchParams,
      lens,
    });

    if (outcome.kind === "miss") {
      return json(res, 404, {
        error: "NO_FIXTURE_FOR_REQUEST",
        detail: `No fixture matches ${req.method} ${url.pathname} for any lens.`,
        method: req.method,
        path: url.pathname,
      });
    }

    if (outcome.kind === "wrong-lens") {
      // Fail closed: never silently reuse a response evidenced for another
      // release line. Name what the evidence covers.
      return json(res, 409, {
        error: "NO_FIXTURE_FOR_VERSION",
        detail:
          `No fixture for ${req.method} ${url.pathname} is evidenced for lens '${lens}'. ` +
          `Evidence covers: ${outcome.coveredLenses.join(", ")}. ` +
          "Capture this lens or tag a fixture with it — do not reuse another lens's response.",
        requestedLens: lens,
        coveredLenses: outcome.coveredLenses,
      });
    }

    const fixture = outcome.fixture;
    if (fixture.provenance.kind === "SYNTHETIC_PLACEHOLDER" && !allowSynthetic) {
      return json(res, 403, {
        error: "SYNTHETIC_FIXTURE_BLOCKED",
        detail:
          `Fixture ${fixture._file} is a SYNTHETIC_PLACEHOLDER, not captured evidence. ` +
          "Start the server with --allow-synthetic to serve it, or replace it with a real capture.",
        fixture: fixture._file,
      });
    }

    const { status, headers = {}, body } = fixture.response;
    const meta = {
      "x-stub-lens": lens,
      "x-stub-fixture": fixture._file,
      "x-stub-provenance": fixture.provenance.kind,
    };
    if (body === undefined) {
      res.writeHead(status, { ...meta, ...headers });
      return res.end();
    }
    const text = typeof body === "string" ? body : JSON.stringify(body, null, 2);
    res.writeHead(status, {
      "content-type": "application/json",
      ...meta,
      ...headers,
      "content-length": Buffer.byteLength(text),
    });
    res.end(text);
  });

  return { server, store };
}

export function parseArgs(argv) {
  const args = {
    port: 8009,
    defaultLens: null,
    allowSynthetic: false,
    fixturesDir: join(HERE, "fixtures"),
    dictionariesDir: join(HERE, "..", "dictionaries", "_synthetic"),
  };
  const rest = [...argv];
  while (rest.length > 0) {
    const a = rest.shift();
    if (a === "--port") args.port = Number(rest.shift());
    else if (a === "--lens") args.defaultLens = rest.shift() ?? null;
    else if (a === "--allow-synthetic") args.allowSynthetic = true;
    else if (a === "--fixtures") args.fixturesDir = rest.shift() ?? args.fixturesDir;
    else if (a === "--dictionaries") args.dictionariesDir = rest.shift() ?? args.dictionariesDir;
    else throw new Error(`Unknown option '${a}'.\n${USAGE}`);
  }
  if (!Number.isInteger(args.port) || args.port < 0 || args.port > 65535) {
    throw new Error(`Invalid --port value.\n${USAGE}`);
  }
  return args;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const { server, store } = createStubServer({ ...args, log: console.error });
    server.listen(args.port, () => {
      const addr = server.address();
      console.error(
        `Stub listening on http://localhost:${addr.port} — ${store.count} fixture(s), ` +
          `default lens: ${args.defaultLens ?? "(none; x-version-lens header required)"}, ` +
          `synthetic fixtures ${args.allowSynthetic ? "ENABLED" : "blocked (use --allow-synthetic)"}`
      );
    });
  } catch (err) {
    console.error(err instanceof FixtureError ? `Refusing to start: ${err.message}` : err.message);
    process.exit(2);
  }
}
