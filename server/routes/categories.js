const express = require("express");
const router = express.Router();
const pool = require("../db");
const redisClient = require("../utils/redisClient");
const { AUTH_ROLES } = require("../constants/auth");
const adminAuthorization = require("../middleware/authorization").forRole(
  AUTH_ROLES.ADMIN,
);
const adminOnly = require("../middleware/adminOnly");
const {
  parseDisplayOrder,
  slugifyCategoryName,
  validateCategoryName,
} = require("../utils/categories");

const adminAccess = [adminAuthorization, adminOnly];

async function invalidateCategoryCaches() {
  try {
    for (const pattern of ["*listings*", "*partners*", "*getAllCategories*"]) {
      let cursor = "0";
      do {
        const [nextCursor, keys] = await redisClient.scan(
          cursor,
          "MATCH",
          pattern,
          "COUNT",
          100,
        );
        cursor = nextCursor;
        if (keys.length > 0) await redisClient.del(...keys);
      } while (cursor !== "0");
    }
  } catch (error) {
    console.error("Category cache invalidation failed:", error.message);
  }
}

router.get("/", async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT category_id AS id, name, slug, display_order
       FROM activity_categories
       WHERE is_active = true
       ORDER BY display_order ASC, name ASC`,
    );
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("ERROR in GET /categories", error.message);
    return res.status(500).json({ error: "Unable to load categories" });
  }
});

router.get("/admin", ...adminAccess, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         ac.category_id AS id,
         ac.name,
         ac.slug,
         ac.is_active,
         ac.display_order,
         ac.created_at,
         ac.updated_at,
         (SELECT COUNT(*)::int
          FROM partner_activity_categories pac
          WHERE pac.category_id = ac.category_id) AS partner_count,
         (SELECT COUNT(*)::int
          FROM listing_activity_categories lac
          WHERE lac.category_id = ac.category_id) AS listing_count
       FROM activity_categories ac
       ORDER BY ac.display_order ASC, ac.name ASC`,
    );
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("ERROR in GET /categories/admin", error.message);
    return res.status(500).json({ error: "Unable to load categories" });
  }
});

router.post("/", ...adminAccess, async (req, res) => {
  const validatedName = validateCategoryName(req.body?.name);
  if (validatedName.error) {
    return res.status(400).json({ error: validatedName.error });
  }

  const requestedOrder =
    req.body?.display_order == null
      ? null
      : parseDisplayOrder(req.body.display_order);
  if (req.body?.display_order != null && requestedOrder == null) {
    return res
      .status(400)
      .json({ error: "Display order must be a non-negative whole number" });
  }

  const slug = slugifyCategoryName(validatedName.name);
  if (!slug) {
    return res.status(400).json({ error: "Unable to create a category slug" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO activity_categories (name, slug, display_order)
       VALUES (
         $1,
         $2,
         COALESCE(
           $3,
           (SELECT COALESCE(MAX(display_order), -1) + 1 FROM activity_categories)
         )
       )
       RETURNING category_id AS id, name, slug, is_active, display_order,
                 created_at, updated_at`,
      [validatedName.name, slug, requestedOrder],
    );
    await invalidateCategoryCaches();
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "That category already exists" });
    }
    console.error("ERROR in POST /categories", error.message);
    return res.status(500).json({ error: "Unable to create category" });
  }
});

router.patch("/:categoryId", ...adminAccess, async (req, res) => {
  const categoryId = Number(req.params.categoryId);
  if (!Number.isSafeInteger(categoryId) || categoryId <= 0) {
    return res.status(400).json({ error: "Invalid category ID" });
  }

  const updates = [];
  const values = [];
  const addUpdate = (sql, value) => {
    values.push(value);
    updates.push(`${sql} = $${values.length}`);
  };

  if (req.body?.name !== undefined) {
    const validatedName = validateCategoryName(req.body.name);
    if (validatedName.error) {
      return res.status(400).json({ error: validatedName.error });
    }
    addUpdate("name", validatedName.name);
  }

  if (req.body?.display_order !== undefined) {
    const displayOrder = parseDisplayOrder(req.body.display_order);
    if (displayOrder == null) {
      return res
        .status(400)
        .json({ error: "Display order must be a non-negative whole number" });
    }
    addUpdate("display_order", displayOrder);
  }

  if (req.body?.is_active !== undefined) {
    if (typeof req.body.is_active !== "boolean") {
      return res.status(400).json({ error: "Active status must be a boolean" });
    }
    addUpdate("is_active", req.body.is_active);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: "No category changes were provided" });
  }

  values.push(categoryId);
  try {
    const result = await pool.query(
      `UPDATE activity_categories
       SET ${updates.join(", ")}, updated_at = NOW()
       WHERE category_id = $${values.length}
       RETURNING category_id AS id, name, slug, is_active, display_order,
                 created_at, updated_at`,
      values,
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Category not found" });
    }
    await invalidateCategoryCaches();
    return res.status(200).json(result.rows[0]);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "That category already exists" });
    }
    console.error("ERROR in PATCH /categories/:categoryId", error.message);
    return res.status(500).json({ error: "Unable to update category" });
  }
});

module.exports = router;
