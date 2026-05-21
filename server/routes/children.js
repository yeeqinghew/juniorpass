const express = require("express");
const router = express.Router();
const pool = require("../db");
const etagMiddleware = require("../middleware/etagMiddleware");
const cacheMiddleware = require("../middleware/cacheMiddleware");
const authorization = require("../middleware/authorization");
const client = require("../utils/redisClient");
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

  // Basic validation
  if (!name || !date_of_birth || !gender) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (!["M", "F"].includes(gender)) {
    return res.status(400).json({ error: "Invalid gender" });
  }

  // Validate DOB
  if (!isValidDOB(date_of_birth)) {
    return res.status(400).json({
      error: "Invalid DOB. DOB cannot be in the future.",
    });
  }

  try {
    const newChild = await pool.query(
      `INSERT INTO children (name, date_of_birth, gender, special_notes, parent_id) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, date_of_birth, gender, special_notes, parent_id],
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
      typeof updates.special_notes === "undefined"
    ) {
      return res.status(400).json({ error: "No fields provided for update" });
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
         special_notes = COALESCE($4, special_notes)
       WHERE child_id = $5
       RETURNING *`,
      [
        updates.name ?? null,
        updates.date_of_birth ?? null,
        updates.gender ?? null,
        updates.special_notes ?? null,
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
