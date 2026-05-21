const aws = require("aws-sdk");
const crypto = require("crypto");
const { promisify } = require("util");
const randomBytes = promisify(crypto.randomBytes);
require("dotenv").config();

const s3 = new aws.S3({
  region: process.env.awsRegion,
  accessKeyId: process.env.s3AccessKey,
  secretAccessKey: process.env.s3SecretAccessKey,
  signatureVersion: "v4",
});

async function generateS3UploadURL(folder) {
  if (!folder) throw new Error("Folder name is required");

  const rawBytes = await randomBytes(16);
  const imageName = rawBytes.toString("hex");

  folder = folder.replace(/\/$/, ""); // ensure folder path does not start or end with "/"
  const key = `${folder}/${imageName}`;

  const uploadURL = await s3.getSignedUrlPromise("putObject", {
    Bucket: process.env.s3BucketName,
    Key: key,
    Expires: 60,
  });
  return { uploadURL, key };
}

async function deleteS3Objects(keys) {
  const objects = keys.map((key) => ({
    Key: key,
  }));
  const params = {
    Bucket: process.env.s3BucketName,
    Delete: {
      Objects: objects,
      Quiet: false,
    },
  };

  await s3.deleteObjects(params).promise();
}

module.exports = { generateS3UploadURL, deleteS3Objects };
