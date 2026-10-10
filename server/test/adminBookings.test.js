const test = require("node:test");
const assert = require("node:assert/strict");
const { listAdminBookings } = require("../services/adminBookings.service");

test("admin booking workspace applies server-side filters and pagination", async () => {
  const booking = {
    booking_id: "11111111-1111-4111-a111-111111111111",
    listing_title: "Junior Basketball",
    booking_status: "upcoming",
    occurrences: [],
    filtered_total: 7,
  };
  const calls = [];
  const dbPool = {
    async query(sql, params) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      calls.push({ sql: normalized, params });
      if (normalized.includes("COUNT(*) OVER()")) {
        return { rowCount: 1, rows: [booking] };
      }
      return {
        rowCount: 1,
        rows: [
          {
            total: 10,
            upcoming: 7,
            in_progress: 1,
            completed: 2,
            cancelled: 0,
          },
        ],
      };
    },
  };

  const result = await listAdminBookings({
    dbPool,
    search: "basketball",
    status: "upcoming",
    page: 2,
    limit: 5,
    offset: 5,
  });

  const listCall = calls.find(({ sql }) => sql.includes("COUNT(*) OVER()"));
  assert.deepEqual(listCall.params, ["basketball", "upcoming", 5, 5]);
  assert.equal(result.bookings[0].filtered_total, undefined);
  assert.equal(result.pagination.total, 7);
  assert.equal(result.pagination.total_pages, 2);
  assert.equal(result.summary.total, 10);
});
