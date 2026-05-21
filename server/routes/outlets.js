const express = require("express");
const router = express.Router();
const pool = require("../db");
const authorization = require("../middleware/authorization");

// Get all outlets for a partner
router.get("/partner/:partnerId", authorization, async (req, res) => {
  const { partnerId } = req.params;
  if (req.user !== partnerId) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  try {
    const outlets = await pool.query(
      `
        SELECT 
            o.*, 
            COUNT(DISTINCT lo.listing_id) AS listing_count
        FROM outlets o
        LEFT JOIN listingOutlets lo ON o.outlet_id = lo.outlet_id
        WHERE o.partner_id = $1
        GROUP BY o.outlet_id
        ORDER BY o.created_at DESC
    `,
      [partnerId],
    );
    res.json(outlets.rows);
  } catch (err) {
    console.error("Error fetching outlets:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get a single outlet (public - for users viewing listings)
router.get("/:outletId", async (req, res) => {
  const { outletId } = req.params;

  try {
    const outlet = await pool.query(
      `
        SELECT 
            o.*,
            p.partner_name,
            p.email as partner_email,
            p.website as partner_website,
            COUNT(DISTINCY lo.listing_id) AS listing_count
        FROM outlets o
        JOIN partners p ON o.partner_id = p.partner_id
        LEFT JOIN listings_outlets lo ON o.outlet_id = lo.outlet_id
        WHERE o.outlet_id = $1
        GROUP BY o.outlet_id, p.partner_id
    `,
      [outletId],
    );

    if (outlet.rows.length === 0) {
      return res.status(404).json({ error: "Outlet not found" });
    }

    res.json(outlet.rows[0]);
  } catch (err) {
    console.error("Error fetching outlet:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", authorization, async (req, res) => {
  const partnerId = req.user;
  const {
    outlet_name,
    address,
    nearest_mrt,
    description,
    phone_number,
    images,
  } = req.body;

  if (!outlet_name || !address || !nearest_mrt)
    return res.status(400).json({
      error: "Missing required fields: outlet_name, address, nearest_mrt",
    });

  try {
    // Check for duplicate outlet name for the same partner
    const duplicate = await pool.query(
      "SELECT outlet_id FROM outlets WHERE partner_id = $1 AND outlet_name = $2",
      [partnerId, outlet_name],
    );
    if (duplicate.rows.length > 0) {
      return res
        .status(400)
        .json({ error: "Outlet name already exists for this partner" });
    }

    const result = await pool.query(
      `INSERT INTO outlets (partner_id, outlet_name, address, nearest_mrt, description, phone_number, images)
            VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        partnerId,
        outlet_name,
        address,
        nearest_mrt,
        description,
        phone_number,
        images,
      ],
    );

    res.status(201).json({
      message: "Outlet created successfully",
      outlet: result.rows[0],
    });
  } catch (err) {
    console.error("Error creating outlet:", err);

    // Handle unique constraint violation for outlet name
    if (err.code === "23505") {
      return res
        .status(400)
        .json({ error: "Outlet name already exists for this partner" });
    }

    res.status(500).json({ error: "Internal server error" });
  }
});

// update outlet
router.patch("/:outletId", authorization, async (req, res) => {
  const { outletId } = req.params;
  const partnerId = req.user;
  const updates = req.body;

  try {
    const ownerCheck = await pool.query(
      "SELECT partner_id FROM outlets WHERE outlet_id = $1",
      [outletId],
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: "Outlet not found" });
    }

    if (ownerCheck.rows[0].partner_id !== partnerId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Build dynamic UPDATE clause
    const allowedFields = [
      "outlet_name",
      "address",
      "nearest_mrt",
      "description",
      "phone_number",
      "images",
    ];
    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.keys(updates).forEach((key) => {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = $${paramCount}`);
        values.push(updates[key]);
        paramCount++;
      }
    });

    if (fields.length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    values.push(outletId); // For WHERE clause
    const result = await pool.query(
      `UPDATE outlets SET ${fields.join(", ")} WHERE outlet_id = $${paramCount} RETURNING *`,
      values,
    );

    res.json({
      message: "Outlet updated successfully",
      outlet: result.rows[0],
    });
  } catch (err) {
    console.error("Error updating outlet:", err);

    if (err.code === "23505") {
      return res
        .status(400)
        .json({ error: "Outlet name already exists for this partner" });
    }

    res.status(500).json({ error: "Internal server error" });
  }
});

// TODO: delete outlet - unsure yet

module.exports = router;
