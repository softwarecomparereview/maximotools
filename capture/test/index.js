// Entry point so `node --test capture/test/` works on Node builds that
// resolve a directory argument as a module instead of globbing it.
// Node builds that glob natively ignore this file (it doesn't match *.test.*).
module.exports = import("./capture.test.mjs");
