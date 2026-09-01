const express = require("express");
const router = express.Router();
const pool = require("../db");
const { AUTH_ROLES } = require("../constants/auth");
const authorization = require("../middleware/authorization").forRole(
  AUTH_ROLES.PARTNER,
);
const etagMiddleware = require("../middleware/etagMiddleware");
const cacheMiddleware = require("../middleware/cacheMiddleware");
const client = require("../utils/redisClient");
const { getDollarsPerCredit } = require("../utils/platformSettings");
const {
  deleteCloudinaryImage,
} = require("../services/storage/storage.service");
const { parseCategoryIds } = require("../utils/categories");

require("dotenv").config();
router.use(etagMiddleware);

async function invalidateListingCaches() {
  try {
    let cursor = "0";
    do {
      const [nextCursor, keys] = await client.scan(
        cursor,
        "MATCH",
        "*listings*",
        "COUNT",
        100,
      );
      cursor = nextCursor;
      if (keys.length > 0) await client.del(...keys);
    } while (cursor !== "0");
  } catch (error) {
    console.error("Listing cache invalidation failed:", error.message);
  }
}

// create listing
router.post("", authorization, async (req, res) => {
  let db;
  let transactionOpen = false;
  try {
    const {
      partner_id,
      title,
      // lesson_type,
      description,
      category_ids,
      age_groups,
      images,
      outlets,
    } = req.body;

    const partnerIdFromToken = req.user;
    const parsedCategoryIds = parseCategoryIds(category_ids);

    // Validation: Check for required fields
    if (
      !title ||
      // !lesson_type ||
      !description ||
      !parsedCategoryIds ||
      parsedCategoryIds.length === 0 ||
      !age_groups ||
      !Array.isArray(outlets) ||
      outlets.length === 0
    ) {
      return res.status(400).json({
        error: "Missing required fields",
        details: {
          title: !title ? "Title is required" : null,
          // lesson_type: !lesson_type ? "Lesson type is required" : null,
          description: !description ? "Description is required" : null,
          categories:
            !parsedCategoryIds || parsedCategoryIds.length === 0
              ? "At least one category is required"
              : null,
          age_groups: !age_groups ? "Age groups are required" : null,
          outlets:
            !Array.isArray(outlets) || outlets.length === 0
              ? "At least one outlet is required"
              : null,
        },
      });
    }

    const invalidProgramme = outlets.some(
      (outlet) =>
        !outlet?.outlet_id ||
        !Array.isArray(outlet.schedule_groups) ||
        outlet.schedule_groups.length === 0 ||
        outlet.schedule_groups.some(
          (schedule) =>
            !Array.isArray(schedule.time_slots) ||
            schedule.time_slots.length === 0 ||
            schedule.time_slots.some(
              (slot) =>
                !slot?.day ||
                !Array.isArray(slot.timeslot) ||
                slot.timeslot.length !== 2 ||
                !slot.timeslot[0] ||
                !slot.timeslot[1] ||
                !Number.isInteger(slot.slots) ||
                slot.slots < 1 ||
                slot.slots > 100,
            ),
        ),
    );

    if (invalidProgramme) {
      return res.status(400).json({
        error:
          "Each outlet needs at least one complete schedule with a day, time, and capacity",
      });
    }

    const outletIds = outlets.map((outlet) => outlet.outlet_id);
    if (new Set(outletIds).size !== outletIds.length) {
      return res.status(400).json({ error: "An outlet can only be added once" });
    }

    const ownedOutlets = await pool.query(
      `SELECT outlet_id
       FROM outlets
       WHERE partner_id = $1 AND outlet_id = ANY($2::uuid[])`,
      [partnerIdFromToken, outletIds],
    );
    if (ownedOutlets.rowCount !== outletIds.length) {
      return res.status(403).json({
        error: "One or more selected outlets do not belong to this partner",
      });
    }

    const validCategories = await pool.query(
      `SELECT category_id
       FROM activity_categories
       WHERE is_active = true AND category_id = ANY($1::integer[])`,
      [parsedCategoryIds],
    );
    if (validCategories.rowCount !== parsedCategoryIds.length) {
      return res.status(400).json({ error: "One or more categories are unavailable" });
    }

    db = await pool.connect();
    await db.query("BEGIN");
    transactionOpen = true;

    // Note: We allow empty images array here because images are uploaded after listing creation
    // The constraint will be enforced when the listing is finalized (PATCH with images)

    // insert listing
    const listing = await db.query(
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

    await db.query(
      `INSERT INTO listing_activity_categories (listing_id, category_id)
       SELECT $1, UNNEST($2::integer[])`,
      [listing_id, parsedCategoryIds],
    );

    // Insert outlets and schedule groups
    for (let outlet of outlets) {
      const { outlet_id, schedule_groups } = outlet;

      // Insert into listingOutlets
      const listingOutlet = await db.query(
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
        const pricingDollarsPerCredit = await getDollarsPerCredit();

        // 1. Insert schedule_group (the enrollable program)
        const scheduleGroupResult = await db.query(
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
            frequency,
            pricing_dollars_per_credit
          ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING schedule_group_id`,
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
            pricingDollarsPerCredit,
          ],
        );

        const schedule_group_id = scheduleGroupResult.rows[0].schedule_group_id;

        // 2. Insert time slots for this schedule group
        for (let slot of time_slots || []) {
          const { day, timeslot, slots: slotCapacity } = slot;

          // Parse timeslot array: [start, end]
          const start_time = timeslot && timeslot[0] ? timeslot[0] : null;
          const end_time = timeslot && timeslot[1] ? timeslot[1] : null;

          await db.query(
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

    await db.query("COMMIT");
    transactionOpen = false;

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
    if (db && transactionOpen) await db.query("ROLLBACK");
    console.error("ERROR in /listings POST", err.message);
    res.status(500).json({ error: err.message });
  } finally {
    db?.release();
  }
});

// get all listings
router.get("", cacheMiddleware, async (req, res) => {
  try {
    const listings = await pool.query(
      ` SELECT
        l.*,
        COALESCE((
          SELECT jsonb_agg(ac.name ORDER BY ac.display_order, ac.name)
          FROM listing_activity_categories lac
          JOIN activity_categories ac ON ac.category_id = lac.category_id
          WHERE lac.listing_id = l.listing_id AND ac.is_active = true
        ), '[]'::jsonb) AS categories,
        COALESCE((
          SELECT jsonb_agg(ac.category_id ORDER BY ac.display_order, ac.name)
          FROM listing_activity_categories lac
          JOIN activity_categories ac ON ac.category_id = lac.category_id
          WHERE lac.listing_id = l.listing_id AND ac.is_active = true
        ), '[]'::jsonb) AS category_ids,
        json_build_object(
          'partner_id', p.partner_id,
          'partner_name', p.partner_name,
          'email', p.email,
          'categories', COALESCE((
            SELECT jsonb_agg(ac.name ORDER BY ac.display_order, ac.name)
            FROM partner_activity_categories pac
            JOIN activity_categories ac ON ac.category_id = pac.category_id
            WHERE pac.partner_id = p.partner_id AND ac.is_active = true
          ), '[]'::jsonb),
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
                    'pricing_dollars_per_credit', sg.pricing_dollars_per_credit,
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
router.get("/:id([0-9a-fA-F-]{36})", cacheMiddleware, async (req, res) => {
  const id = req.params.id;

  try {
    const listing = await pool.query(
      `
      SELECT
        l.*,
        (
          SELECT COUNT(*)::integer
          FROM bookings b
          WHERE b.listing_id = l.listing_id
        ) AS signup_count,
        COALESCE((
          SELECT jsonb_agg(ac.name ORDER BY ac.display_order, ac.name)
          FROM listing_activity_categories lac
          JOIN activity_categories ac ON ac.category_id = lac.category_id
          WHERE lac.listing_id = l.listing_id AND ac.is_active = true
        ), '[]'::jsonb) AS categories,
        COALESCE((
          SELECT jsonb_agg(ac.category_id ORDER BY ac.display_order, ac.name)
          FROM listing_activity_categories lac
          JOIN activity_categories ac ON ac.category_id = lac.category_id
          WHERE lac.listing_id = l.listing_id AND ac.is_active = true
        ), '[]'::jsonb) AS category_ids,
        json_build_object(
          'partner_id', p.partner_id,
          'partner_name', p.partner_name,
          'email', p.email,
          'categories', COALESCE((
            SELECT jsonb_agg(ac.name ORDER BY ac.display_order, ac.name)
            FROM partner_activity_categories pac
            JOIN activity_categories ac ON ac.category_id = pac.category_id
            WHERE pac.partner_id = p.partner_id AND ac.is_active = true
          ), '[]'::jsonb),
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
                    'pricing_dollars_per_credit', sg.pricing_dollars_per_credit,
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
          SELECT COUNT(*)::integer
          FROM bookings b
          WHERE b.listing_id = l.listing_id
        ) AS signup_count,
        COALESCE((
          SELECT jsonb_agg(ac.name ORDER BY ac.display_order, ac.name)
          FROM listing_activity_categories lac
          JOIN activity_categories ac ON ac.category_id = lac.category_id
          WHERE lac.listing_id = l.listing_id AND ac.is_active = true
        ), '[]'::jsonb) AS categories,
        COALESCE((
          SELECT jsonb_agg(ac.category_id ORDER BY ac.display_order, ac.name)
          FROM listing_activity_categories lac
          JOIN activity_categories ac ON ac.category_id = lac.category_id
          WHERE lac.listing_id = l.listing_id AND ac.is_active = true
        ), '[]'::jsonb) AS category_ids,
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
                    'pricing_dollars_per_credit', sg.pricing_dollars_per_credit,
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
  let db;
  let transactionOpen = false;
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
    const parsedCategoryIds =
      req.body.category_ids === undefined
        ? undefined
        : parseCategoryIds(req.body.category_ids);

    if (
      req.body.category_ids !== undefined &&
      (!parsedCategoryIds || parsedCategoryIds.length === 0)
    ) {
      return res.status(400).json({ error: "Select at least one valid category" });
    }

    if (parsedCategoryIds) {
      const validCategories = await pool.query(
        `SELECT category_id
         FROM activity_categories
         WHERE is_active = true AND category_id = ANY($1::integer[])`,
        [parsedCategoryIds],
      );
      if (validCategories.rowCount !== parsedCategoryIds.length) {
        return res.status(400).json({ error: "One or more categories are unavailable" });
      }
    }

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

    db = await pool.connect();
    await db.query("BEGIN");
    transactionOpen = true;

    // Update listing (credit/price removed - credit is per-schedule)
    const updatedListing = await db.query(
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

    if (parsedCategoryIds) {
      await db.query(
        "DELETE FROM listing_activity_categories WHERE listing_id = $1",
        [id],
      );
      await db.query(
        `INSERT INTO listing_activity_categories (listing_id, category_id)
         SELECT $1, UNNEST($2::integer[])`,
        [id, parsedCategoryIds],
      );
    }

    await db.query("COMMIT");
    transactionOpen = false;
    await Promise.all([client.del(`/listings/${id}`), client.del(`/listings`)]);

    res.status(200).json({
      message: "Listing has been updated!",
      data: updatedListing.rows[0],
    });
  } catch (error) {
    if (db && transactionOpen) await db.query("ROLLBACK");
    console.error(`ERROR in PATCH /listings/${id}:`, error);
    res.status(500).json({ error: error.message });
  } finally {
    db?.release();
  }
});

router.delete("/:id", authorization, async (req, res) => {
  const id = req.params.id;
  try {
    // retrieve image URLs from the DB
    const { rows } = await pool.query(
      `SELECT images, partner_id FROM listings WHERE listing_id = $1`,
      [id],
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Listing not found" });
    }
    if (rows[0].partner_id !== req.user) {
      return res.status(403).json({ error: "Not authorized to delete this listing" });
    }

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
router.patch("/:listing_id/status", authorization, async (req, res) => {
  const { listing_id } = req.params;
  const { active } = req.body;

  if (typeof active !== "boolean") {
    return res.status(400).json({ error: "Active status must be a boolean" });
  }

  try {
    const result = await pool.query(
      `UPDATE listings
       SET active = $1
       WHERE listing_id = $2 AND partner_id = $3
         AND (
           $1::boolean = true
           OR NOT EXISTS (
             SELECT 1 FROM bookings b WHERE b.listing_id = listings.listing_id
           )
         )
       RETURNING listing_id`,
      [active, listing_id, req.user],
    );
    
    if (result.rowCount === 0) {
      const listingCheck = await pool.query(
        `SELECT
           EXISTS (
             SELECT 1 FROM bookings b WHERE b.listing_id = l.listing_id
           ) AS has_signups
         FROM listings l
         WHERE l.listing_id = $1 AND l.partner_id = $2`,
        [listing_id, req.user],
      );

      if (listingCheck.rows[0]?.has_signups && active === false) {
        return res.status(409).json({
          error: "Listings with sign-ups cannot be set to inactive",
        });
      }

      return res
        .status(404)
        .json({ error: "Listing not found or not owned by this partner" });
    }

    await invalidateListingCaches();

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

        // Retain each program's original pricing rate when a partner edits
        // non-price details. Newly added programs use the active rate.
        const existingRatesResult = await tx.query(
          `SELECT schedule_group_id, pricing_dollars_per_credit,
                  price_payg, price_fullterm, price_shortterm
           FROM schedule_groups WHERE listing_outlet_id = $1`,
          [listing_outlet_id],
        );
        const existingRates = new Map(
          existingRatesResult.rows.map((row) => [
            row.schedule_group_id,
            row,
          ]),
        );

        // Delete existing schedule_groups (cascades to schedules)
        await tx.query(
          `DELETE FROM schedule_groups WHERE listing_outlet_id = $1`,
          [listing_outlet_id],
        );

        // Insert new schedule groups and their time slots
        for (const schedule of schedules) {
          const {
            time_slots,
            schedule_group_id: existingScheduleGroupId,
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
          const existingPricing = existingRates.get(existingScheduleGroupId);
          const samePrice =
            existingPricing &&
            Number(existingPricing.price_payg || 0) ===
              Number(price_payg || 0) &&
            Number(existingPricing.price_fullterm || 0) ===
              Number(price_fullterm || 0) &&
            Number(existingPricing.price_shortterm || 0) ===
              Number(price_shortterm || 0);
          const pricingDollarsPerCredit = samePrice
            ? Number(existingPricing.pricing_dollars_per_credit)
            : await getDollarsPerCredit(tx);

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
              frequency,
              pricing_dollars_per_credit
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING schedule_group_id`,
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
              pricingDollarsPerCredit,
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
            [schedule_group_id, listing_outlet_id, day, start_time, end_time, slotCapacity],
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
      whereClauses.push(
        `EXISTS (
          SELECT 1
          FROM listing_activity_categories filter_lac
          JOIN activity_categories filter_ac
            ON filter_ac.category_id = filter_lac.category_id
          WHERE filter_lac.listing_id = l.listing_id
            AND filter_ac.is_active = true
            AND (
              LOWER(filter_ac.name) = LOWER($${idx})
              OR filter_ac.slug = LOWER($${idx})
            )
        )`,
      );
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
        COALESCE((
          SELECT jsonb_agg(ac.name ORDER BY ac.display_order, ac.name)
          FROM listing_activity_categories lac
          JOIN activity_categories ac ON ac.category_id = lac.category_id
          WHERE lac.listing_id = l.listing_id AND ac.is_active = true
        ), '[]'::jsonb) AS categories,
        COALESCE((
          SELECT jsonb_agg(ac.category_id ORDER BY ac.display_order, ac.name)
          FROM listing_activity_categories lac
          JOIN activity_categories ac ON ac.category_id = lac.category_id
          WHERE lac.listing_id = l.listing_id AND ac.is_active = true
        ), '[]'::jsonb) AS category_ids,
        json_build_object(
          'partner_id', p.partner_id,
          'partner_name', p.partner_name,
          'email', p.email,
          'categories', COALESCE((
            SELECT jsonb_agg(ac.name ORDER BY ac.display_order, ac.name)
            FROM partner_activity_categories pac
            JOIN activity_categories ac ON ac.category_id = pac.category_id
            WHERE pac.partner_id = p.partner_id AND ac.is_active = true
          ), '[]'::jsonb),
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
                    'pricing_dollars_per_credit', sg.pricing_dollars_per_credit,
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
