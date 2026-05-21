const express = require("express");
const router = express.Router();
const pool = require("../db");
const authorization = require("../middleware/authorization");
const etagMiddleware = require("../middleware/etagMiddleware");
const cacheMiddleware = require("../middleware/cacheMiddleware");
const client = require("../utils/redisClient");
const { deleteS3Objects } = require("../utils/s3");

require("dotenv").config();
router.use(etagMiddleware);

// create listing
router.post("", authorization, async (req, res) => {
  try {
    const {
      partner_id,
      title,
      package_types,
      description,
      age_groups,
      images,
      short_term_start_date,
      long_term_start_date,
      outlets,
    } = req.body;

    const partnerIdFromToken = req.user;

    // insert listing
    const listing = await pool.query(
      `INSERT INTO listings (
        partner_id, 
        listing_title, 
        package_types,      
        description,
        age_groups,
        rating, 
        images,
        short_term_start_date,
        long_term_start_date,
        active
      ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        partnerIdFromToken,
        title,
        package_types,
        description,
        age_groups,
        0,
        images,
        short_term_start_date,
        long_term_start_date,
        true,
      ],
    );

    const listing_id = listing.rows[0].listing_id;

    // Insert into listingOutlets
    const schedulePromises = [];

    for (let outlet of outlets) {
      const { outlet_id, schedules } = outlet;

      // Insert into listingOutlets
      const listingOutlet = await pool.query(
        `
        INSERT INTO listingOutlets (listing_id, outlet_id) VALUES($1, $2) RETURNING *`,
        [listing_id, outlet_id],
      );
      const listing_outlet_id = listingOutlet.rows[0].listing_outlet_id;

      for (let schedule of schedules) {
        const {
          day,
          timeslot,
          frequency,
          slots,
          credit: scheduleCredit,
        } = schedule;

        schedulePromises.push(
          pool.query(
            `INSERT INTO schedules (listing_outlet_id, day, timeslot, frequency, slots, credit)
             VALUES($1, $2, $3, $4, $5, $6)`,
            [
              listing_outlet_id,
              day,
              timeslot,
              frequency,
              slots || 10,
              scheduleCredit || 1,
            ],
          ),
        );
      }
    }

    // Execute all schedule insert queries in parallel
    await Promise.all(schedulePromises);

    // Invalidate cache
    await client.del("/listings");

    // Admin notifications: new listing created
    try {
      await pool.query(
        `INSERT INTO notifications (recipient_type, recipient_id, type, title, message, data)
         SELECT 'admin', admin_id, 'new_listing', 'New listing created', 'A new listing has been created.',
                jsonb_build_object('listing_id', $1, 'partner_id', $2, 'title', $3)
         FROM admins`,
        [listing_id, partnerIdFromToken, title],
      );
    } catch (notifyErr) {
      console.error(
        "Failed to insert admin notification (new listing):",
        notifyErr.message,
      );
    }

    res.status(201).json({
      message: "Listing has been created!",
      data: listing.rows[0],
    });
  } catch (err) {
    console.error("ERROR in /listings POST", err.message);
    res.status(500).json({ error: err.message });
  }
});

// get all listings
router.get("", cacheMiddleware, async (req, res) => {
  try {
    const listings = await pool.query(
      ` SELECT 
        l.*,
        json_build_object(
          'partner_id', p.partner_id,
          'partner_name', p.partner_name,
          'email', p.email,
          'categories', p.categories,
          'contact_number', p.contact_number,
          'rating', p.rating,
          'picture', p.picture,
          'website', p.website
        ) AS partner_info,
         jsonb_agg(
          jsonb_build_object(
            'schedule_id', s.schedule_id,
            'day', s.day,
            'timeslot', s.timeslot,
            'frequency', s.frequency,
            'slots', s.slots,
            'credit', s.credit,
            'outlet_id', o.outlet_id,
            'outlet_address', o.address,
            'nearest_mrt', o.nearest_mrt
          )
        ) AS schedule_info
      FROM listings l
      JOIN partners p ON p.partner_id = l.partner_id
      LEFT JOIN listingOutlets lo ON lo.listing_id = l.listing_id
      LEFT JOIN outlets o ON o.outlet_id = lo.outlet_id
      LEFT JOIN schedules s ON s.listing_outlet_id = lo.listing_outlet_id
      WHERE l.active = true
      GROUP BY l.listing_id, p.partner_id
      ORDER BY l.created_at DESC;
      `,
    );
    return res.status(200).json(listings.rows);
  } catch (err) {
    console.error("ERROR in /listings GET", err.message);
    res.status(500).json({ error: err.message });
  }
});

// get listing by listing_id
router.get("/:id", cacheMiddleware, async (req, res) => {
  const id = req.params.id;

  try {
    const listing = await pool.query(
      `
      SELECT 
        l.*,
        json_build_object(
          'partner_id', p.partner_id,
          'partner_name', p.partner_name,
          'email', p.email,
          'categories', p.categories,
          'contact_number', p.contact_number,
          'rating', p.rating,
          'picture', p.picture,
          'website', p.website
        ) AS partner_info,
         jsonb_agg(
          jsonb_build_object(
            'schedule_id', s.schedule_id,
            'day', s.day,
            'timeslot', s.timeslot,
            'frequency', s.frequency,
            'slots', s.slots,
            'credit', s.credit,
            'outlet_id', o.outlet_id,
            'outlet_address', o.address,
            'nearest_mrt', o.nearest_mrt
          )
        ) AS schedule_info
      FROM listings l
      JOIN partners p ON p.partner_id = l.partner_id
      LEFT JOIN listingOutlets lo ON lo.listing_id = l.listing_id
      LEFT JOIN outlets o ON o.outlet_id = lo.outlet_id
      LEFT JOIN schedules s ON s.listing_outlet_id = lo.listing_outlet_id
      WHERE l.listing_id = $1
      GROUP BY l.listing_id, p.partner_id
      ORDER BY l.created_at DESC;`,
      [id],
    );

    return res.status(200).json(listing.rows[0]);
  } catch (err) {
    console.error(`ERROR in /listings/${id} GET`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// get listing by partner_id
router.get("/partner/:partnerId", async (req, res) => {
  const { partnerId } = req.params;

  try {
    const listings = await pool.query(
      `
      SELECT * FROM listings l
      WHERE l.partner_id = $1
      ORDER BY 
          l.created_at DESC;`,
      [partnerId],
    );

    return res.status(200).json(listings.rows);
  } catch (error) {
    console.error(`ERROR in /listings/partner/${partnerId} GET`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// edit listing
router.patch("/:id", authorization, async (req, res) => {
  const id = req.params.id;
  try {
    // Fetch the existing listing
    const existingListing = await pool.query(
      "SELECT * FROM listings WHERE listing_id = $1",
      [id],
    );

    if (existingListing.rows.length === 0) {
      return res.status(404).json({ error: "Listing not found" });
    }

    // Authorize partner ownership
    if (existingListing.rows[0].partner_id !== req.user) {
      return res
        .status(403)
        .json({ error: "Not authorized to modify this listing" });
    }

    // Merge existing data with new data (partial update)
    const updatedData = {
      title_name: req.body.title_name || existingListing.rows[0].listing_title,
      package_types:
        req.body.package_types ?? existingListing.rows[0].package_types,
      description: req.body.description ?? existingListing.rows[0].description,
      age_groups: req.body.age_groups ?? existingListing.rows[0].age_groups,
      images: req.body.images ?? existingListing.rows[0].images,
      short_term_start_date:
        req.body.short_term_start_date !== undefined
          ? req.body.short_term_start_date
          : existingListing.rows[0].short_term_start_date,
      long_term_start_date:
        req.body.long_term_start_date !== undefined
          ? req.body.long_term_start_date
          : existingListing.rows[0].long_term_start_date,
    };

    // Update listing (credit/price removed - credit is per-schedule)
    const updatedListing = await pool.query(
      `UPDATE listings SET
        listing_title = $1,
        package_types = $2,
        description = $3,
        age_groups = $4,
        images = $5,
        short_term_start_date = $6,
        long_term_start_date = $7
      WHERE listing_id = $8 RETURNING *`,
      [
        updatedData.title_name,
        updatedData.package_types,
        updatedData.description,
        updatedData.age_groups,
        updatedData.images,
        updatedData.short_term_start_date,
        updatedData.long_term_start_date,
        id,
      ],
    );

    // Invalidate cache
    await client.del(`/listings/${id}`);

    res.status(200).json({
      message: "Listing has been updated!",
      data: updatedListing.rows[0],
    });
  } catch (error) {
    console.error(`ERROR in /listings/${id} PATCH`, error.message);
    res.status(500).json({ error: error.message });
  }
});

router.delete("/:id", async (req, res) => {
  const id = req.params.id;
  try {
    // retrieve image URLs from the DB
    const { rows } = await pool.query(
      `SELECT images FROM listings WHERE listing_id = $1`,
      [id],
    );

    // Extract image URLs from the database result
    const imageURLs = rows[0].images;
    if (Array.isArray(imageURLs) && imageURLs.length > 0) {
      // Delete images from S3
      await deleteS3Objects(imageURLs);
    }

    // delete listing from DB
    await pool.query(`DELETE FROM listings WHERE listing_id = $1`, [id]);

    // Invalidate the cache
    await client.del(`/listings/${id}`);

    // Optionally, invalidate or update related cache entries, like the list of all listings
    await client.del("/listings");

    res.status(200).json({
      message: "Listing has been deleted!",
    });
  } catch (error) {
    console.error(`ERROR in /listings/${id} DELETE`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// make it inactive
router.patch("/:listing_id/status", async (req, res) => {
  const { listing_id } = req.params;
  const { active } = req.body;

  try {
    await pool.query(`UPDATE listings SET active = $1 WHERE listing_id = $2`, [
      active,
      listing_id,
    ]);
    res.status(200).json({
      message: "Listing status updated successfully.",
    });
  } catch (error) {
    console.error(
      `ERROR in /listings/${listing_id}/status PATCH`,
      error.message,
    );
    res.status(500).json({ error: error.message });
  }
});

/**
 * Partner: Edit schedules (timeslots) for a listing
 * Replaces schedules for provided outlets atomically. Validates partner ownership.
 * Payload:
 * {
 *   "outlets": [
 *     {
 *       "outlet_id": "uuid",
 *       "schedules": [
 *         { "day": "Monday", "timeslot": ["12:00", "13:00"], "frequency": "Weekly" },
 *         ...
 *       ]
 *     }
 *   ]
 * }
 */
router.patch("/:id/schedules", authorization, async (req, res) => {
  const listing_id = req.params.id;
  const { outlets } = req.body;

  try {
    // Validate input
    if (!Array.isArray(outlets) || outlets.length === 0) {
      return res.status(400).json({ error: "No outlets/schedules provided" });
    }

    // Validate partner owns the listing
    const listingOwner = await pool.query(
      "SELECT partner_id FROM listings WHERE listing_id = $1",
      [listing_id],
    );
    if (listingOwner.rowCount === 0) {
      return res.status(404).json({ error: "Listing not found" });
    }
    if (listingOwner.rows[0].partner_id !== req.user) {
      return res
        .status(403)
        .json({ error: "Not authorized to modify this listing" });
    }

    const tx = await pool.connect();
    try {
      await tx.query("BEGIN");

      for (const outlet of outlets) {
        const { outlet_id, schedules } = outlet;
        if (!outlet_id || !Array.isArray(schedules)) {
          await tx.query("ROLLBACK");
          return res.status(400).json({ error: "Invalid outlet payload" });
        }

        // Ensure listingOutlets mapping exists, else create
        const loResult = await tx.query(
          `SELECT listing_outlet_id FROM listingOutlets WHERE listing_id = $1 AND outlet_id = $2`,
          [listing_id, outlet_id],
        );
        let listing_outlet_id;
        if (loResult.rowCount === 0) {
          const insertLO = await tx.query(
            `INSERT INTO listingOutlets (listing_id, outlet_id) VALUES ($1, $2) RETURNING listing_outlet_id`,
            [listing_id, outlet_id],
          );
          listing_outlet_id = insertLO.rows[0].listing_outlet_id;
        } else {
          listing_outlet_id = loResult.rows[0].listing_outlet_id;
        }

        // Replace schedules for this listing_outlet
        await tx.query(`DELETE FROM schedules WHERE listing_outlet_id = $1`, [
          listing_outlet_id,
        ]);

        // Insert new schedules
        for (const sch of schedules) {
          const {
            day,
            timeslot,
            frequency,
            slots,
            credit: scheduleCredit,
          } = sch;
          if (
            !day ||
            !Array.isArray(timeslot) ||
            timeslot.length === 0 ||
            !frequency
          ) {
            await tx.query("ROLLBACK");
            return res.status(400).json({ error: "Invalid schedule payload" });
          }

          await tx.query(
            `INSERT INTO schedules (listing_outlet_id, day, timeslot, frequency, slots, credit)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              listing_outlet_id,
              day,
              timeslot,
              frequency,
              slots || 10,
              scheduleCredit || 1,
            ],
          );
        }
      }

      // Invalidate caches
      await client.del(`/listings/${listing_id}`);
      await client.del("/listings");

      await tx.query("COMMIT");

      // Notify users with upcoming bookings for this listing about schedule changes
      try {
        const bookedUsers = await pool.query(
          `SELECT DISTINCT user_id
           FROM bookings
           WHERE listing_id = $1
             AND start_date >= NOW()`,
          [listing_id],
        );

        const notifications = bookedUsers.rows.map((row) =>
          pool.query(
            `INSERT INTO notifications (recipient_type, recipient_id, type, title, message, data)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              "user",
              row.user_id,
              "schedule_update",
              "Class schedule updated",
              "A class you booked has updated its schedule.",
              JSON.stringify({ listing_id }),
            ],
          ),
        );
        await Promise.all(notifications);
      } catch (notifyErr) {
        console.error(
          "Failed to insert user notifications (schedule update):",
          notifyErr.message,
        );
      }

      return res
        .status(200)
        .json({ message: "Schedules updated successfully" });
    } catch (e) {
      await tx.query("ROLLBACK");
      console.error(
        `ERROR in /listings/${listing_id}/schedules PATCH`,
        e.message,
      );
      return res.status(500).json({ error: e.message });
    } finally {
      tx.release();
    }
  } catch (error) {
    console.error(
      `ERROR in /listings/${listing_id}/schedules PATCH`,
      error.message,
    );
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Listings search with pagination and filters.
 * Query params:
 *   page (default 1), limit (default 10), category, age_group, partner_id
 */
router.get("/search", async (req, res) => {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.max(parseInt(req.query.limit || "10", 10), 1);
  const offset = (page - 1) * limit;
  const { category, age_group, partner_id } = req.query;

  try {
    // Build dynamic WHERE clauses
    const whereClauses = ["l.active = true"];
    const params = [];
    let idx = 1;

    if (partner_id) {
      whereClauses.push(`l.partner_id = $${idx++}`);
      params.push(partner_id);
    }
    if (category) {
      // partners.categories is an array of enum; check if category is present
      whereClauses.push(`$${idx} = ANY(p.categories)`);
      params.push(category);
      idx++;
    }
    if (age_group) {
      // listings.age_groups is an array; check membership
      whereClauses.push(`$${idx} = ANY(l.age_groups)`);
      params.push(age_group);
      idx++;
    }

    const whereSQL = whereClauses.length
      ? "WHERE " + whereClauses.join(" AND ")
      : "";

    const listings = await pool.query(
      `
      SELECT 
        l.*,
        json_build_object(
          'partner_id', p.partner_id,
          'partner_name', p.partner_name,
          'email', p.email,
          'categories', p.categories,
          'contact_number', p.contact_number,
          'rating', p.rating,
          'picture', p.picture,
          'website', p.website
        ) AS partner_info
      FROM listings l
      JOIN partners p ON p.partner_id = l.partner_id
      ${whereSQL}
      ORDER BY l.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
      `,
      [...params, limit, offset],
    );

    // Simple total count for pagination
    const countResult = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM listings l
      JOIN partners p ON p.partner_id = l.partner_id
      ${whereSQL}
      `,
      params,
    );

    return res.status(200).json({
      page,
      limit,
      total: parseInt(countResult.rows[0].total, 10),
      data: listings.rows,
    });
  } catch (error) {
    console.error("ERROR in /listings/search GET", error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
