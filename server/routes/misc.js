const express = require("express");
const router = express.Router();
const pool = require("../db");
const { generateS3UploadURL } = require("../utils/s3.js");
const etagMiddleware = require("../middleware/etagMiddleware");
const cacheMiddleware = require("../middleware/cacheMiddleware");

router.use(etagMiddleware);

router.get("/s3url", async (req, res) => {
  try {
    const { folder } = req.query;
    if (!folder)
      return res.status(400).json({ error: "Folder parameter is required" });

    const { uploadURL, key } = await generateS3UploadURL(folder);
    res.json({ uploadURL, key });
  } catch (error) {
    console.error("ERROR in /misc/s3url", error.message);
    res.status(500).json({ error: error.message });
  }
});

router.get("/getAllAgeGroups", cacheMiddleware, async (req, res) => {
  try {
    const ageGroups = await pool.query("SELECT * FROM ageGroups");
    return res.status(200).json(ageGroups.rows);
  } catch (error) {
    console.error("ERROR in /misc/getAllAgeGroups", error.message);
    res.status(500).json({ error: error.message });
  }
});

router.get("/getAllPackages", cacheMiddleware, async (req, res) => {
  try {
    const packageTypes = await pool.query("SELECT * FROM packageTypes");
    return res.status(200).json(packageTypes.rows);
  } catch (error) {
    console.error("ERROR in /misc/getAllPackages", error.message);
    res.status(500).json({ error: error.message });
  }
});

router.get("/getAllCategories", cacheMiddleware, async (req, res) => {
  try {
    const categories = await pool.query("SELECT * FROM categoriesListings");
    return res.status(200).json(categories.rows);
  } catch (error) {
    console.error("ERROR in /misc/getAllCategories", error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
