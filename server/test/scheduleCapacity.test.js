const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getBookedCapacityQuery,
  getScheduleCapacity,
} = require("../utils/scheduleCapacity");

test("progressive programmes use their shared group capacity", () => {
  assert.equal(
    getScheduleCapacity({ is_progressive: true, capacity: 10, slots: 2 }),
    10,
  );
  assert.deepEqual(
    getBookedCapacityQuery({
      isProgressive: true,
      scheduleGroupId: "group-id",
      scheduleId: "schedule-id",
      startDate: "2026-11-21T08:00:00",
    }),
    {
      text: `SELECT COUNT(*)::integer AS count
               FROM bookings
               WHERE schedule_group_id = $1
                 AND status = 'confirmed'`,
      values: ["group-id"],
    },
  );
});

test("non-progressive timeslots retain per-date capacity", () => {
  assert.equal(
    getScheduleCapacity({ is_progressive: false, capacity: 10, slots: 2 }),
    2,
  );
  const query = getBookedCapacityQuery({
    isProgressive: false,
    scheduleGroupId: "group-id",
    scheduleId: "schedule-id",
    startDate: "2026-11-21T08:00:00",
  });
  assert.match(query.text, /schedule_id = \$1/);
  assert.deepEqual(query.values, ["schedule-id", "2026-11-21T08:00:00"]);
});
