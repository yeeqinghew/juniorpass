const express = require("express");
const router = express.Router();

const {
  getUserDPSignature,
  getPartnerDPSignature,
  getListingImageSignature,
  deleteImages,
} = require("../services/storage/storage.service");
const { AUTH_ROLES } = require("../constants/auth");
const authorization = require("../middleware/authorization");
const userAuthorization = authorization.forRole(AUTH_ROLES.USER);
const partnerAuthorization = authorization.forRole(AUTH_ROLES.PARTNER);
const userOrPartnerAuthorization = authorization.forRoles(
  AUTH_ROLES.USER,
  AUTH_ROLES.PARTNER,
);

// -------------------- USER DP --------------------
router.post("/upload/user-dp", userAuthorization, (req, res) => {
  try {
    const data = getUserDPSignature(req.user);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// -------------------- PARTNER DP --------------------
router.post("/upload/partner-dp", partnerAuthorization, (req, res) => {
  try {
    const data = getPartnerDPSignature(req.user);
    res.json(data);
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
});

// -------------------- LISTING IMAGE --------------------
router.post("/upload/listing-image", partnerAuthorization, (req, res) => {
  try {
    const { listingId } = req.body;

    if (!listingId) {
      return res.status(400).json({ error: "listingId is required" });
    }

    const data = getListingImageSignature(req.user, listingId);

    res.json(data);
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
});

// -------------------- DELETE IMAGES --------------------
router.delete("/delete", userOrPartnerAuthorization, async (req, res) => {
  try {
    const { publicIds } = req.body;

    if (!Array.isArray(publicIds) || publicIds.length === 0) {
      return res.status(400).json({ error: "publicIds array required" });
    }

    const filtered = publicIds.filter((id) => {
      if (req.user && id.startsWith(`juniorpass/users/${req.user}/dp`))
        return true;

      if (req.user && id.startsWith(`juniorpass/partners/${req.user}/dp`))
        return true;

      if (
        req.user &&
        id.startsWith(`juniorpass/partners/${req.user}/listings/`)
      )
        return true;

      return false;
    });

    if (filtered.length === 0) {
      return res.status(403).json({ error: "No valid images to delete" });
    }

    await deleteImages(filtered);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
