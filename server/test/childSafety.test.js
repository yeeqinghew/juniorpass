const test = require("node:test");
const assert = require("node:assert/strict");
const { getSafetyDetails } = require("../utils/childSafety");
const {
  CURRENT_SAFETY_WAIVER,
  getSafetyWaiver,
  isCurrentSafetyWaiverAccepted,
} = require("../utils/safetyWaiver");

test("normalizes a complete child safety profile", () => {
  const result = getSafetyDetails({
    emergency_contact_name: "  Jane Parent  ",
    emergency_contact_relationship: " Mother ",
    emergency_contact_phone: " +65 9123 4567 ",
    authorized_pickups: [
      {
        name: " John Parent ",
        relationship: " Father ",
        phone: " 9876 5432 ",
      },
    ],
  });

  assert.deepEqual(result, {
    emergencyContactName: "Jane Parent",
    emergencyContactRelationship: "Mother",
    emergencyContactPhone: "+65 9123 4567",
    authorizedPickups: [
      {
        name: "John Parent",
        relationship: "Father",
        phone: "9876 5432",
      },
    ],
  });
});

test("rejects missing or malformed safety contacts", () => {
  assert.equal(getSafetyDetails({}), null);
  assert.equal(
    getSafetyDetails({
      emergency_contact_name: "Jane",
      emergency_contact_relationship: "Mother",
      emergency_contact_phone: "abc",
      authorized_pickups: [
        { name: "John", relationship: "Father", phone: "98765432" },
      ],
    }),
    null,
  );
});

test("accepts only the current safety acknowledgement version", () => {
  assert.equal(
    isCurrentSafetyWaiverAccepted({
      accepted: true,
      version: CURRENT_SAFETY_WAIVER.version,
    }),
    true,
  );
  assert.equal(
    isCurrentSafetyWaiverAccepted({ accepted: false, version: 1 }),
    false,
  );
  assert.equal(
    isCurrentSafetyWaiverAccepted({ accepted: true, version: 999 }),
    false,
  );

  const copy = getSafetyWaiver();
  copy.statements.push("Changed");
  assert.equal(
    getSafetyWaiver().statements.includes("Changed"),
    false,
  );
});
