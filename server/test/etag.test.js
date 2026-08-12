const test = require("node:test");
const assert = require("node:assert/strict");

const generateETag = require("../utils/etag");
const etagMiddleware = require("../middleware/etagMiddleware");

test("generateETag is deterministic and changes with its input", () => {
  const first = generateETag({ id: 1, name: "Class" });
  assert.equal(first, generateETag({ id: 1, name: "Class" }));
  assert.notEqual(first, generateETag({ id: 2, name: "Class" }));
  assert.match(first, /^[a-f0-9]{32}$/);
});

test("etagMiddleware adds an ETag and sends fresh JSON", () => {
  const data = { classes: [1, 2] };
  const calls = [];
  const req = { headers: {} };
  const res = {
    set: (name, value) => calls.push(["set", name, value]),
    json: (body) => calls.push(["json", body]),
  };

  etagMiddleware(req, res, () => calls.push(["next"]));
  res.json(data);

  assert.deepEqual(calls, [
    ["next"],
    ["set", "ETag", generateETag(data)],
    ["json", data],
  ]);
});

test("etagMiddleware returns 304 when the client ETag matches", () => {
  const data = { classes: [] };
  const eTag = generateETag(data);
  let jsonCalled = false;
  let ended = false;
  const req = { headers: { "if-none-match": eTag } };
  const res = {
    set() {},
    json() { jsonCalled = true; },
    status(code) { assert.equal(code, 304); return this; },
    end() { ended = true; },
  };

  etagMiddleware(req, res, () => {});
  res.json(data);

  assert.equal(ended, true);
  assert.equal(jsonCalled, false);
});
