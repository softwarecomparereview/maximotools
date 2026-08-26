// Entry point so `node --test stub/test/` works on Node builds that
// resolve a directory argument as a module instead of globbing it.
// Node builds that glob natively ignore this file (it doesn't match *.test.*).
module.exports = import("./stub.test.mjs");
