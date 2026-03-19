//express
const express = require("express");
const route = express.Router();

// S3 multer
const { uploadToS3 } = require("../../util/s3multerUpload");

//controller
const FileController = require("./file.controller");
const {
  getS3SignedUrl,
  transcode,
  getCloudfrontSignedUrl,
} = require("../../util/hls");
const { authenticate, authorize } = require("../middleware/auth.middleware");
const { userRoles } = require("../../util/helper");
const { uploadVttSubtitle, multerUpload } = require("../../util/subtitleHelper");

//upload content to S3
route.post(
  "/upload-file",
  authenticate,
  authorize([userRoles.ADMIN, userRoles.USER]),
  uploadToS3,
  FileController.uploadContent
);

route.post("/upload-vtt-subtitle", multerUpload.single("content"), uploadVttSubtitle);

//delete upload content
route.delete(
  "/delete-upload",
  authenticate,
  authorize([userRoles.ADMIN, userRoles.USER]),
  FileController.deleteUploadContent
);

// FOR HLS ----
route.post(
  "/signed-url",
  authenticate,
  authorize([userRoles.ADMIN, userRoles.USER]),
  FileController.getS3SignedUrl
);

// Add Mux routes
route.post(
  "/mux-upload-url",
  authenticate,
  authorize([userRoles.ADMIN]),
  FileController.getMuxUploadUrl
);

// route.get(
//   "/mux-asset-status/:uploadId",
//   authenticate,
//   authorize([userRoles.ADMIN, userRoles.USER]),
//   FileController.getMuxAssetStatus
// );

route.post('/mux-webhook', FileController.handleWebhook);

module.exports = route;
