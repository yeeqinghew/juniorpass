const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, file), "utf8");

test("promotion schema supports per-user limits, shared funding and termination", () => {
  const migration = read("../migrations/add_admin_promotion_management.sql");
  assert.match(migration, /per_user_redemption_limit/);
  assert.match(migration, /platform_funding_percentage/);
  assert.match(migration, /'shared'/);
  assert.match(migration, /'terminated'/);
  assert.match(migration, /DROP CONSTRAINT IF EXISTS promotion_redemptions_promotion_id_user_id_key/);
});

test("admin promotion API exposes create, review, controls and reporting", () => {
  const route = read("../routes/promotions.js");
  assert.match(route, /router\.post\("\/admin"/);
  assert.match(route, /router\.patch\("\/admin\/:promotionId\/review"/);
  assert.match(route, /router\.patch\("\/admin\/:promotionId\/status"/);
  assert.match(route, /router\.get\("\/admin\/:promotionId\/report"/);
  assert.match(route, /selected_user_emails/);
  assert.match(route, /INSERT INTO promotion_allowed_users/);
});

test("booking rechecks and locks promotion eligibility in its transaction", () => {
  const bookings = read("../routes/bookings.js");
  const pricing = read("../services/promotionPricing.service.js");
  assert.match(bookings, /getPromotionPrice\(client,[\s\S]*lock: true/);
  assert.match(pricing, /FOR UPDATE/);
  assert.match(pricing, /user_redemption_count/);
  assert.match(pricing, /per_user_redemption_limit/);
});
