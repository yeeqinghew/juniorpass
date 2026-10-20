const express = require("express");
const router = express.Router();
const pool = require("../db");
const { AUTH_ROLES } = require("../constants/auth");
const etagMiddleware = require("../middleware/etagMiddleware");
const authorization = require("../middleware/authorization").forRole(
  AUTH_ROLES.USER,
);
const client = require("../utils/redisClient");
const { getSafetyDetails, normalizeText } = require("../utils/childSafety");
router.use(etagMiddleware);

function isValidDOB(dob) {
  const birthDate = new Date(dob);
  const today = new Date();

  // check if date is valid
  if (isNaN(birthDate.getTime())) return false;

  // check if date is not in the future
  if (birthDate > today) return false;

  return true;
}

// router.post("/add-child", authorization, async (req, res) => {
router.post("", authorization, async (req, res) => {
  const { name, date_of_birth, gender, special_notes } = req.body;
  const parent_id = req.user;
  const safetyDetails = getSafetyDetails(req.body);

  // Basic validation
  if (!name || !date_of_birth || !gender) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (!["M", "F"].includes(gender)) {
    return res.status(400).json({ error: "Invalid gender" });
  }

  if (!safetyDetails) {
    return res.status(400).json({
      error:
        "Emergency contact and at least one valid authorised pickup person are required",
    });
  }

  // Validate DOB
  if (!isValidDOB(date_of_birth)) {
    return res.status(400).json({
      error: "Invalid DOB. DOB cannot be in the future.",
    });
  }

  try {
    const newChild = await pool.query(
      `INSERT INTO children (
         name, date_of_birth, gender, special_notes, parent_id,
         emergency_contact_name, emergency_contact_relationship,
         emergency_contact_phone, authorized_pickups, safety_updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, NOW())
       RETURNING *`,
      [
        name.trim(),
        date_of_birth,
        gender,
        normalizeText(special_notes, 2000),
        parent_id,
        safetyDetails.emergencyContactName,
        safetyDetails.emergencyContactRelationship,
        safetyDetails.emergencyContactPhone,
        JSON.stringify(safetyDetails.authorizedPickups),
      ],
    );

    // Optionally, invalidate or update related cache entries, like the list of all listings
    await client.del(`/children/${parent_id}`);

    res.status(201).json({
      message: "Child has been created!",
      data: newChild.rows[0],
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: error.message });
  }
});

router.get("/:parent_id", authorization, async (req, res) => {
  const parent_id = req.params.parent_id;

  // Ensure requester is the owner of the children resource
  if (req.user !== parent_id) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const children = await pool.query(
      "SELECT * FROM children WHERE parent_id = $1",
      [parent_id],
    );
    return res.status(200).json(children.rows);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Update a child (name/date_of_birth/gender/special_notes). Only the owning parent can update.
 */
router.patch("/:child_id", authorization, async (req, res) => {
  const { child_id } = req.params;
  const parent_id = req.user;
  const { name, date_of_birth, gender, special_notes } = req.body;
  const updatesSafetyDetails = [
    "emergency_contact_name",
    "emergency_contact_relationship",
    "emergency_contact_phone",
    "authorized_pickups",
  ].some((field) => Object.prototype.hasOwnProperty.call(req.body, field));
  const safetyDetails = updatesSafetyDetails ? getSafetyDetails(req.body) : null;

  try {
    // Verify child exists and is owned by requester
    const child = await pool.query(
      "SELECT parent_id FROM children WHERE child_id = $1",
      [child_id],
    );
    if (child.rowCount === 0) {
      return res.status(404).json({ error: "Child not found" });
    }
    if (child.rows[0].parent_id !== parent_id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // Basic validation
    const updates = {
      name,
      date_of_birth,
      gender,
      special_notes,
    };
    if (
      typeof updates.name === "undefined" &&
      typeof updates.date_of_birth === "undefined" &&
      typeof updates.gender === "undefined" &&
      typeof updates.special_notes === "undefined" &&
      !updatesSafetyDetails
    ) {
      return res.status(400).json({ error: "No fields provided for update" });
    }
    if (updatesSafetyDetails && !safetyDetails) {
      return res.status(400).json({
        error:
          "Emergency contact and at least one valid authorised pickup person are required",
      });
    }
    if (
      typeof updates.gender !== "undefined" &&
      !["M", "F"].includes(updates.gender)
    ) {
      return res.status(400).json({ error: "Invalid gender" });
    }

    // Validate DOB if provided
    if (
      typeof updates.date_of_birth !== "undefined" &&
      !isValidDOB(updates.date_of_birth)
    ) {
      return res.status(400).json({
        error: "Invalid DOB. DOB cannot be in the future.",
      });
    }

    const updated = await pool.query(
      `UPDATE children
       SET
         name = COALESCE($1, name),
         date_of_birth = COALESCE($2, date_of_birth),
         gender = COALESCE($3, gender),
         special_notes = CASE WHEN $4 THEN $5 ELSE special_notes END,
         emergency_contact_name = CASE WHEN $6 THEN $7 ELSE emergency_contact_name END,
         emergency_contact_relationship = CASE WHEN $6 THEN $8 ELSE emergency_contact_relationship END,
         emergency_contact_phone = CASE WHEN $6 THEN $9 ELSE emergency_contact_phone END,
         authorized_pickups = CASE WHEN $6 THEN $10::jsonb ELSE authorized_pickups END,
         safety_updated_at = CASE WHEN $6 THEN NOW() ELSE safety_updated_at END
       WHERE child_id = $11
       RETURNING *`,
      [
        typeof updates.name === "string" ? updates.name.trim() : null,
        updates.date_of_birth ?? null,
        updates.gender ?? null,
        typeof updates.special_notes !== "undefined",
        normalizeText(updates.special_notes, 2000),
        updatesSafetyDetails,
        safetyDetails?.emergencyContactName ?? null,
        safetyDetails?.emergencyContactRelationship ?? null,
        safetyDetails?.emergencyContactPhone ?? null,
        JSON.stringify(safetyDetails?.authorizedPickups ?? []),
        child_id,
      ],
    );

    // Invalidate cache for this parent's children
    await client.del(`/children/${parent_id}`);

    return res.status(200).json({
      message: "Child updated successfully",
      data: updated.rows[0],
    });
  } catch (error) {
    console.error("ERROR in PATCH /children/:child_id", error.message);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Delete a child. Only the owning parent can delete.
 */
router.delete("/:child_id", authorization, async (req, res) => {
  const { child_id } = req.params;
  const parent_id = req.user;

  try {
    // Verify child exists and is owned by requester
    const child = await pool.query(
      "SELECT parent_id FROM children WHERE child_id = $1",
      [child_id],
    );
    if (child.rowCount === 0) {
      return res.status(404).json({ error: "Child not found" });
    }
    if (child.rows[0].parent_id !== parent_id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    await pool.query("DELETE FROM children WHERE child_id = $1", [child_id]);

    // Invalidate cache for this parent's children
    await client.del(`/children/${parent_id}`);

    return res.status(200).json({ message: "Child deleted successfully" });
  } catch (error) {
    console.error("ERROR in DELETE /children/:child_id", error.message);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
