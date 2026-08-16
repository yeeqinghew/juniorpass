const express = require("express");
const router = express.Router();
const pool = require("../db");
const authorization = require("../middleware/authorization");
const etagMiddleware = require("../middleware/etagMiddleware");
const cacheMiddleware = require("../middleware/cacheMiddleware");
const client = require("../utils/redisClient");
const {
  deleteCloudinaryImage,
} = require("../services/storage/storage.service");

require("dotenv").config();
router.use(etagMiddleware);

// create listing
router.post("", authorization, async (req, res) => {
  try {
    const {
      partner_id,
      title,
      // lesson_type,
      description,
      age_groups,
      images,
      outlets,
    } = req.body;

    const partnerIdFromToken = req.user;

    // Validation: Check for required fields
    if (
      !title ||
      // !lesson_type ||
      !description ||
      !age_groups ||
      !outlets ||
      outlets.length === 0
    ) {
      return res.status(400).json({
        error: "Missing required fields",
        details: {
          title: !title ? "Title is required" : null,
          // lesson_type: !lesson_type ? "Lesson type is required" : null,
          description: !description ? "Description is required" : null,
          age_groups: !age_groups ? "Age groups are required" : null,
          outlets:
            !outlets || outlets.length === 0
              ? "At least one outlet is required"
              : null,
        },
      });
    }

    // Note: We allow empty images array here because images are uploaded after listing creation
    // The constraint will be enforced when the listing is finalized (PATCH with images)

    // insert listing
    const listing = await pool.query(
      `INSERT INTO listings (
        partner_id,
        listing_title,
        description,
        age_groups,
        rating,
        images,
        active
      ) VALUES($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        partnerIdFromToken,
        title,
        // lesson_type,
        description,
        age_groups,
        0,
        images,
        true,
      ],
    );

    const listing_id = listing.rows[0].listing_id;

    // Insert outlets and schedule groups
    for (let outlet of outlets) {
      const { outlet_id, schedule_groups } = outlet;

      // Insert into listingOutlets
      const listingOutlet = await pool.query(
        `INSERT INTO listingOutlets (listing_id, outlet_id) VALUES($1, $2) RETURNING *`,
        [listing_id, outlet_id],
      );
      const listing_outlet_id = listingOutlet.rows[0].listing_outlet_id;

      // Each schedule represents one enrollable program
      for (let schedule of schedule_groups || []) {
        const {
          time_slots,
          frequency,
          package_types,
          is_progressive,
          full_term_start_date,
          full_term_class_count,
          short_term_class_count,
          price_payg,
          price_fullterm,
          price_shortterm,
        } = schedule;

        // 1. Insert schedule_group (the enrollable program)
        const scheduleGroupResult = await pool.query(
          `INSERT INTO schedule_groups (
            listing_outlet_id,
            package_types,
            is_progressive,
            full_term_start_date,
            full_term_class_count,
            short_term_class_count,
            price_payg,
            price_fullterm,
            price_shortterm,
            frequency
          ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING schedule_group_id`,
          [
            listing_outlet_id,
            package_types || ["pay-as-you-go"],
            is_progressive || false,
            full_term_start_date || null,
            full_term_class_count || null,
            short_term_class_count || null,
            price_payg || null,
            price_fullterm || null,
            price_shortterm || null,
            frequency,
          ],
        );

        const schedule_group_id = scheduleGroupResult.rows[0].schedule_group_id;

        // 2. Insert time slots for this schedule group
        for (let slot of time_slots || []) {
          const { day, timeslot, slots: slotCapacity } = slot;

          // Parse timeslot array: [start, end]
          const start_time = timeslot && timeslot[0] ? timeslot[0] : null;
          const end_time = timeslot && timeslot[1] ? timeslot[1] : null;

          await pool.query(
            `INSERT INTO schedules (
              schedule_group_id,
              listing_outlet_id,
              day,
              start_time,
              end_time,
              slots
            ) VALUES($1, $2, $3, $4, $5, $6)`,
            [schedule_group_id, listing_outlet_id, day, start_time, end_time, slotCapacity || 10],
          );
        }
      }
    }

    // Invalidate cache
    await client.del("/listings");

    // Admin notifications: new listing created
    // try {
    //   await pool.query(
    //     `INSERT INTO notifications (recipient_type, recipient_id, type, title, message, data)
    //      SELECT 'admin', admin_id, 'new_listing', 'New listing created', 'A new listing has been created.',
    //             jsonb_build_object('listing_id', $1, 'partner_id', $2, 'title', $3)
    //      FROM admins`,
    //     [listing_id, partnerIdFromToken, title],
    //   );
    // } catch (notifyErr) {
    //   console.error(
    //     "Failed to insert admin notification (new listing):",
    //     notifyErr.message,
    //   );
    // }

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
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'outlet_id', o.outlet_id,
              'outlet_address', o.address,
              'nearest_mrt', o.nearest_mrt,
              'schedule_groups', (
                SELECT jsonb_agg(
                  jsonb_build_object(
                    'schedule_group_id', sg.schedule_group_id,
                    'package_types', sg.package_types,
                    'is_progressive', COALESCE(sg.is_progressive, false),
                    'full_term_start_date', sg.full_term_start_date,
                    'full_term_class_count', sg.full_term_class_count,
                    'short_term_class_count', sg.short_term_class_count,
                    'price_payg', sg.price_payg,
                    'price_fullterm', sg.price_fullterm,
                    'price_shortterm', sg.price_shortterm,
                    'frequency', sg.frequency,
                    'time_slots', (
                      SELECT jsonb_agg(
                        jsonb_build_object(
                          'schedule_id', s.schedule_id,
                          'day', s.day,
                          'start_time', s.start_time,
                          'end_time', s.end_time,
                          'slots', s.slots
                        )
                        ORDER BY
                          CASE s.day
                            WHEN 'Monday' THEN 1
                            WHEN 'Tuesday' THEN 2
                            WHEN 'Wednesday' THEN 3
                            WHEN 'Thursday' THEN 4
                            WHEN 'Friday' THEN 5
                            WHEN 'Saturday' THEN 6
                            WHEN 'Sunday' THEN 7
                          END,
                          s.start_time
                      )
                      FROM schedules s
                      WHERE s.schedule_group_id = sg.schedule_group_id
                    )
                  )
                )
                FROM schedule_groups sg
                WHERE sg.listing_outlet_id = lo.listing_outlet_id
              )
            )
          )
          FROM listingOutlets lo
          LEFT JOIN outlets o ON o.outlet_id = lo.outlet_id
          WHERE lo.listing_id = l.listing_id
        ) AS outlets_info
      FROM listings l
      JOIN partners p ON p.partner_id = l.partner_id
      WHERE l.active = true
        AND (
          CASE
            WHEN jsonb_typeof(l.images) = 'array' THEN jsonb_array_length(l.images) > 0
            ELSE false
          END
        )
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
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'outlet_id', o.outlet_id,
              'outlet_address', o.address,
              'nearest_mrt', o.nearest_mrt,
              'schedule_groups', (
                SELECT jsonb_agg(
                  jsonb_build_object(
                    'schedule_group_id', sg.schedule_group_id,
                    'package_types', sg.package_types,
                    'is_progressive', COALESCE(sg.is_progressive, false),
                    'full_term_start_date', sg.full_term_start_date,
                    'full_term_class_count', sg.full_term_class_count,
                    'short_term_class_count', sg.short_term_class_count,
                    'price_payg', sg.price_payg,
                    'price_fullterm', sg.price_fullterm,
                    'price_shortterm', sg.price_shortterm,
                    'frequency', sg.frequency,
                    'time_slots', (
                      SELECT jsonb_agg(
                        jsonb_build_object(
                          'schedule_id', s.schedule_id,
                          'day', s.day,
                          'start_time', s.start_time,
                          'end_time', s.end_time,
                          'slots', s.slots
                        )
                        ORDER BY
                          CASE s.day
                            WHEN 'Monday' THEN 1
                            WHEN 'Tuesday' THEN 2
                            WHEN 'Wednesday' THEN 3
                            WHEN 'Thursday' THEN 4
                            WHEN 'Friday' THEN 5
                            WHEN 'Saturday' THEN 6
                            WHEN 'Sunday' THEN 7
                          END,
                          s.start_time
                      )
                      FROM schedules s
                      WHERE s.schedule_group_id = sg.schedule_group_id
                    )
                  )
                )
                FROM schedule_groups sg
                WHERE sg.listing_outlet_id = lo.listing_outlet_id
              )
            )
          )
          FROM listingOutlets lo
          LEFT JOIN outlets o ON o.outlet_id = lo.outlet_id
          WHERE lo.listing_id = l.listing_id
        ) AS outlets_info
      FROM listings l
      JOIN partners p ON p.partner_id = l.partner_id
      WHERE l.listing_id = $1
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
      SELECT
        l.*,
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'outlet_id', o.outlet_id,
              'outlet_address', o.address,
              'nearest_mrt', o.nearest_mrt,
              'schedule_groups', (
                SELECT jsonb_agg(
                  jsonb_build_object(
                    'schedule_group_id', sg.schedule_group_id,
                    'package_types', sg.package_types,
                    'is_progressive', COALESCE(sg.is_progressive, false),
                    'full_term_start_date', sg.full_term_start_date,
                    'full_term_class_count', sg.full_term_class_count,
                    'short_term_class_count', sg.short_term_class_count,
                    'price_payg', sg.price_payg,
                    'price_fullterm', sg.price_fullterm,
                    'price_shortterm', sg.price_shortterm,
                    'frequency', sg.frequency,
                    'time_slots', (
                      SELECT jsonb_agg(
                        jsonb_build_object(
                          'schedule_id', s.schedule_id,
                          'day', s.day,
                          'start_time', s.start_time,
                          'end_time', s.end_time,
                          'slots', s.slots
                        )
                        ORDER BY
                          CASE s.day
                            WHEN 'Monday' THEN 1
                            WHEN 'Tuesday' THEN 2
                            WHEN 'Wednesday' THEN 3
                            WHEN 'Thursday' THEN 4
                            WHEN 'Friday' THEN 5
                            WHEN 'Saturday' THEN 6
                            WHEN 'Sunday' THEN 7
                          END,
                          s.start_time
                      )
                      FROM schedules s
                      WHERE s.schedule_group_id = sg.schedule_group_id
                    )
                  )
                )
                FROM schedule_groups sg
                WHERE sg.listing_outlet_id = lo.listing_outlet_id
              )
            )
          )
          FROM listingOutlets lo
          LEFT JOIN outlets o ON o.outlet_id = lo.outlet_id
          WHERE lo.listing_id = l.listing_id
        ) AS outlets_info
      FROM listings l
      WHERE l.partner_id = $1
      ORDER BY l.created_at DESC;`,
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

    const listing = existingListing.rows[0];

    // Authorize partner ownership
    if (listing.partner_id !== req.user) {
      return res
        .status(403)
        .json({ error: "Not authorized to modify this listing" });
    }

    // Merge existing data with new data (partial update)
    const updatedData = {
      listing_title: req.body.listing_title ?? listing.listing_title,
      // lesson_type: req.body.lesson_type ?? listing.lesson_type,
      description: req.body.description ?? listing.description,
      age_groups: req.body.age_groups ?? listing.age_groups,
      images: req.body.images ?? listing.images,
    };

    // Validate images: must have at least one image
    if (
      !updatedData.images ||
      !Array.isArray(updatedData.images) ||
      updatedData.images.length === 0
    ) {
      return res.status(400).json({
        error: "Images validation failed",
        message: "Listing must have at least one image",
      });
    }

    // Update listing (credit/price removed - credit is per-schedule)
    const updatedListing = await pool.query(
      `UPDATE listings SET
        listing_title = $1,
        description = $2,
        age_groups = $3,
        images = $4
      WHERE listing_id = $5 RETURNING *`,
      [
        updatedData.listing_title,
        updatedData.description,
        updatedData.age_groups,
        JSON.stringify(updatedData.images),
        id,
      ],
    );

    // Invalidate cache
    await Promise.all([client.del(`/listings/${id}`), client.del(`/listings`)]);

    // Invalidate cache
    await Promise.all([client.del(`/listings/${id}`), client.del(`/listings`)]);

    res.status(200).json({
      message: "Listing has been updated!",
      data: updatedListing.rows[0],
    });
  } catch (error) {
    console.error(`ERROR in PATCH /listings/${id}:`, error);
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
      // Delete images from Cloudinary
      await deleteCloudinaryImage(imageURLs);
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
 * Partner: Edit schedules for a listing
 * Replaces schedule groups for provided outlets atomically. Validates partner ownership.
 * Payload:
 * {
 *   "outlets": [
 *     {
 *       "outlet_id": "uuid",
 *       "schedules": [
 *         {
 *           "time_slots": [
 *             { "day": "Saturday", "timeslot": ["09:00", "10:00"] },
 *             { "day": "Sunday", "timeslot": ["09:00", "10:00"] }
 *           ],
 *           "frequency": "Weekly",
 *           "slots": 10,
 *           "package_types": ["full-term"],
 *           "is_progressive": true,
 *           "full_term_class_count": 20,
 *           "price_fullterm": 1000
 *         }
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

        // Delete existing schedule_groups (cascades to schedules)
        await tx.query(
          `DELETE FROM schedule_groups WHERE listing_outlet_id = $1`,
          [listing_outlet_id],
        );

        // Insert new schedule groups and their time slots
        for (const schedule of schedules) {
          const {
            time_slots,
            frequency,
            package_types,
            is_progressive,
            full_term_start_date,
            full_term_class_count,
            short_term_class_count,
            price_payg,
            price_fullterm,
            price_shortterm,
          } = schedule;

          if (
            !frequency ||
            !Array.isArray(time_slots) ||
            time_slots.length === 0
          ) {
            await tx.query("ROLLBACK");
            return res.status(400).json({ error: "Invalid schedule payload" });
          }

          // Insert schedule_group
          const groupResult = await tx.query(
            `INSERT INTO schedule_groups (
              listing_outlet_id,
              package_types,
              is_progressive,
              full_term_start_date,
              full_term_class_count,
              short_term_class_count,
              price_payg,
              price_fullterm,
              price_shortterm,
              frequency
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING schedule_group_id`,
            [
              listing_outlet_id,
              package_types || ["pay-as-you-go"],
              is_progressive || false,
              full_term_start_date || null,
              full_term_class_count || null,
              short_term_class_count || null,
              price_payg || null,
              price_fullterm || null,
              price_shortterm || null,
              frequency,
            ],
          );

          const schedule_group_id = groupResult.rows[0].schedule_group_id;

          // Insert time slots for this schedule group
          for (const slot of time_slots) {
            const { day, timeslot, slots: slotCapacity } = slot;
            if (!day || !Array.isArray(timeslot) || timeslot.length < 2) {
              await tx.query("ROLLBACK");
              return res
                .status(400)
                .json({ error: "Invalid time slot payload" });
            }

            const start_time = timeslot[0];
            const end_time = timeslot[1];

            await tx.query(
              `INSERT INTO schedules (
                schedule_group_id,
                listing_outlet_id,
                day,
                start_time,
                end_time,
                slots
              ) VALUES ($1, $2, $3, $4, $5, $6)`,
              [schedule_group_id, listing_outlet_id, day, start_time, end_time, slotCapacity || 10],
            );
          }
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

        // const notifications = bookedUsers.rows.map((row) =>
        //   pool.query(
        //     `INSERT INTO notifications (recipient_type, recipient_id, type, title, message, data)
        //      VALUES ($1, $2, $3, $4, $5, $6)`,
        //     [
        //       "user",
        //       row.user_id,
        //       "schedule_update",
        //       "Class schedule updated",
        //       "A class you booked has updated its schedule.",
        //       JSON.stringify({ listing_id }),
        //     ],
        //   ),
        // );
        // await Promise.all(notifications);
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
        ) AS partner_info,
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'outlet_id', o.outlet_id,
              'outlet_address', o.address,
              'nearest_mrt', o.nearest_mrt,
              'schedule_groups', (
                SELECT jsonb_agg(
                  jsonb_build_object(
                    'schedule_group_id', sg.schedule_group_id,
                    'package_types', sg.package_types,
                    'is_progressive', COALESCE(sg.is_progressive, false),
                    'full_term_start_date', sg.full_term_start_date,
                    'full_term_class_count', sg.full_term_class_count,
                    'short_term_class_count', sg.short_term_class_count,
                    'price_payg', sg.price_payg,
                    'price_fullterm', sg.price_fullterm,
                    'price_shortterm', sg.price_shortterm,
                    'frequency', sg.frequency,
                    'time_slots', (
                      SELECT jsonb_agg(
                        jsonb_build_object(
                          'schedule_id', s.schedule_id,
                          'day', s.day,
                          'start_time', s.start_time,
                          'end_time', s.end_time,
                          'slots', s.slots
                        )
                        ORDER BY
                          CASE s.day
                            WHEN 'Monday' THEN 1
                            WHEN 'Tuesday' THEN 2
                            WHEN 'Wednesday' THEN 3
                            WHEN 'Thursday' THEN 4
                            WHEN 'Friday' THEN 5
                            WHEN 'Saturday' THEN 6
                            WHEN 'Sunday' THEN 7
                          END,
                          s.start_time
                      )
                      FROM schedules s
                      WHERE s.schedule_group_id = sg.schedule_group_id
                    )
                  )
                )
                FROM schedule_groups sg
                WHERE sg.listing_outlet_id = lo.listing_outlet_id
              )
            )
          )
          FROM listingOutlets lo
          LEFT JOIN outlets o ON o.outlet_id = lo.outlet_id
          WHERE lo.listing_id = l.listing_id
        ) AS outlets_info
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
