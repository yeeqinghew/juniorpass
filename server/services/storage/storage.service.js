const {
  generateUploadSignature,
  deleteCloudinaryImage,
} = require("./cloudinary.service");

const crypto = require("crypto");

// -------------------- USER DP --------------------
function getUserDPSignature(userId) {
  if (!userId) throw new Error("User ID required");

  return generateUploadSignature({
    folder: `juniorpass/users/${userId}/dp`,
    public_id: "profile",
    overwrite: true,
    resource_type: "image",
  });
}

// -------------------- PARTNER DP --------------------
function getPartnerDPSignature(partnerId) {
  if (!partnerId) throw new Error("Partner ID required");

  return generateUploadSignature({
    folder: `juniorpass/partners/${partnerId}/dp`,
    public_id: "profile",
    overwrite: true,
    resource_type: "image",
  });
}

// -------------------- LISTING IMAGES --------------------
function getListingImageSignature(partnerId, listingId) {
  if (!partnerId) throw new Error("Partner ID required");
  if (!listingId) throw new Error("Listing ID required");

  const public_id = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;

  return generateUploadSignature({
    folder: `juniorpass/partners/${partnerId}/listings/${listingId}/images`,
    public_id,
    overwrite: false,
    resource_type: "image",
  });
}

// -------------------- DELETE --------------------
function deleteImages(publicIds) {
  return deleteCloudinaryImage(publicIds);
}

module.exports = {
  getUserDPSignature,
  getPartnerDPSignature,
  getListingImageSignature,
  deleteImages,
};
