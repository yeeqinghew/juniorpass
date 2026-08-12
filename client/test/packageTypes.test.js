import test from "node:test";
import assert from "node:assert/strict";

import {
  getListingPackageTypes,
  getPackageTypeLabel,
  normalisePackageType,
} from "../src/utils/packageTypes.js";

test("normalisePackageType canonicalises aliases and formatting", () => {
  assert.equal(normalisePackageType(" Trial_Class "), "trial");
  assert.equal(normalisePackageType("'PAYG'"), "pay-as-you-go");
  assert.equal(normalisePackageType("Full Term Package"), "full-term");
});

test("normalisePackageType handles missing values", () => {
  assert.equal(normalisePackageType(null), "");
  assert.equal(normalisePackageType(undefined), "");
});

test("getListingPackageTypes combines listing and schedule group types", () => {
  const listing = {
    package_types: '{"trial-class",payg}',
    outlets_info: [
      {
        schedule_groups: [
          { package_types: '["short-term-package", "trial"]' },
          { package_types: ["full_term_package", "pay-as-you-go"] },
        ],
      },
    ],
  };

  assert.deepEqual(getListingPackageTypes(listing), [
    "trial",
    "pay-as-you-go",
    "short-term",
    "full-term",
  ]);
});

test("getListingPackageTypes tolerates absent and malformed collections", () => {
  assert.deepEqual(getListingPackageTypes(), []);
  assert.deepEqual(
    getListingPackageTypes({
      package_types: 42,
      outlets_info: [{ schedule_groups: null }, null],
    }),
    [],
  );
});

test("getPackageTypeLabel returns friendly labels and preserves unknown values", () => {
  assert.equal(getPackageTypeLabel("trial-package"), "Trial class");
  assert.equal(getPackageTypeLabel("payg"), "Pay as you go");
  assert.equal(getPackageTypeLabel("custom"), "custom");
});
