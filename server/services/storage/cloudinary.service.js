const cloudinary = require("./cloudinary.client");

function generateUploadSignature(params) {
  const timestamp = Math.floor(Date.now() / 1000);
  const allowedParams = {
    folder: params.folder,
    public_id: params.public_id,
    overwrite: params.overwrite,
    timestamp,
  };

  const signature = cloudinary.utils.api_sign_request(
    allowedParams,
    process.env.CLOUDINARY_API_SECRET,
  );

  return {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    allowedParams,
    signature,
  };
}

async function deleteCloudinaryImage(publicIds) {
  if (!Array.isArray(publicIds)) {
    throw new Error("publicIds must be an array of strings.");
  }

  return cloudinary.api.delete_resources(publicIds);
}

module.exports = {
  generateUploadSignature,
  deleteCloudinaryImage,
};
