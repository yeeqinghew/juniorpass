const test = require("node:test");
const assert = require("node:assert/strict");

const validInfo = require("../middleware/validInfo");

const runMiddleware = (path, body) => {
  let nextCalled = false;
  const response = {};
  const res = {
    status(code) { response.status = code; return this; },
    json(bodyValue) { response.body = bodyValue; return this; },
  };

  validInfo({ path, body }, res, () => { nextCalled = true; });
  return { nextCalled, response };
};

test("register requires all credentials", () => {
  const result = runMiddleware("/register", {
    email: "parent@example.com",
    name: "Parent",
    password: "secret",
  });

  assert.equal(result.nextCalled, false);
  assert.deepEqual(result.response, {
    status: 403,
    body: { message: "Missing Credentials" },
  });
});

test("login rejects an invalid email", () => {
  const result = runMiddleware("/login", {
    email: "not-an-email",
    password: "secret",
  });

  assert.equal(result.nextCalled, false);
  assert.equal(result.response.status, 401);
  assert.deepEqual(result.response.body, { message: "Invalid Email" });
});

test("valid register and login requests continue", () => {
  const register = runMiddleware("/register", {
    email: "parent@example.com",
    name: "Parent",
    password: "secret",
    phoneNumber: "91234567",
  });
  const login = runMiddleware("/login", {
    email: "parent@example.com",
    password: "secret",
  });

  assert.equal(register.nextCalled, true);
  assert.equal(login.nextCalled, true);
});

test("partner form requires its contact fields", () => {
  const invalid = runMiddleware("/partnerForm", {
    companyName: "Acme",
    companyPersonName: "Alex",
    email: "alex@example.com",
  });
  const valid = runMiddleware("/partnerForm", {
    companyName: "Acme",
    companyPersonName: "Alex",
    email: "alex@example.com",
    message: "Hello",
  });

  assert.equal(invalid.response.status, 403);
  assert.equal(valid.nextCalled, true);
});

test("unrelated routes pass through", () => {
  assert.equal(runMiddleware("/health", {}).nextCalled, true);
});
