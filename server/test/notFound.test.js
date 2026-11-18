const assert = require("node:assert/strict");
const test = require("node:test");
const apiNotFound = require("../middleware/notFound");

function invokeNotFound(path) {
  const response = { statusCode: null, body: null, contentType: null };
  const request = { path, requestId: "test-request-id" };
  const res = {
    status(code) {
      response.statusCode = code;
      return this;
    },
    json(body) {
      response.contentType = "application/json";
      response.body = body;
      return this;
    },
  };

  apiNotFound(request, res);
  return response;
}

for (const path of ["/unknown", "/api/unknown", "/health1"]) {
  test(`unknown API path ${path} returns a JSON 404`, () => {
    assert.deepEqual(invokeNotFound(path), {
      statusCode: 404,
      contentType: "application/json",
      body: {
        error: "API endpoint not found",
        request_id: "test-request-id",
      },
    });
  });
}
