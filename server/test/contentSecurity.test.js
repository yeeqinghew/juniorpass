const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ContentSecurityValidationError,
  escapeHtml,
  normalizeExternalWebsite,
  normalizeCloudinaryImageUrl,
  normalizeCloudinaryImageList,
} = require("../utils/contentSecurity");

test("escapes HTML metacharacters in generated documents", () => {
  assert.equal(
    escapeHtml(`<img src=x onerror="alert('x')">`),
    "&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;",
  );
});

test("accepts and normalizes HTTPS partner websites", () => {
  assert.equal(
    normalizeExternalWebsite("  https://example.com/classes  "),
    "https://example.com/classes",
  );
});

test("rejects executable and credential-bearing website URLs", () => {
  for (const value of [
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "http://example.com",
    "https://user:password@example.com",
  ]) {
    assert.throws(
      () => normalizeExternalWebsite(value),
      ContentSecurityValidationError,
    );
  }
});

test("only accepts images from the configured Cloudinary account", () => {
  assert.equal(
    normalizeCloudinaryImageUrl(
      "https://res.cloudinary.com/junior-pass/image/upload/v1/profile.png",
      "junior-pass",
    ),
    "https://res.cloudinary.com/junior-pass/image/upload/v1/profile.png",
  );

  for (const value of [
    "javascript:alert(1)",
    "https://evil.example/profile.png",
    "https://res.cloudinary.com/another-account/image/upload/profile.png",
    "https://res.cloudinary.com/junior-pass/raw/upload/payload.svg",
  ]) {
    assert.throws(
      () => normalizeCloudinaryImageUrl(value, "junior-pass"),
      ContentSecurityValidationError,
    );
  }
});

test("validates every image in an image list", () => {
  assert.deepEqual(
    normalizeCloudinaryImageList(
      ["https://res.cloudinary.com/junior-pass/image/upload/one.png"],
      { allowEmpty: false, cloudName: "junior-pass" },
    ),
    ["https://res.cloudinary.com/junior-pass/image/upload/one.png"],
  );
  assert.throws(
    () =>
      normalizeCloudinaryImageList([], {
        allowEmpty: false,
        cloudName: "junior-pass",
      }),
    ContentSecurityValidationError,
  );
});
