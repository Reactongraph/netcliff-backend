//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../util/checkAccess");
const { uploadLoginThumbnailToS3 } = require("../../util/s3multerUpload");
const { cacheMiddleware } = require("../../util/redisUtils");

//controller
const settingController = require("./setting.controller");
const { userRoles } = require("../../util/helper");
const { authorize, authenticate } = require("../middleware/auth.middleware");

//update Setting
route.patch(
  "/update",
  authenticate,
  authorize([userRoles.ADMIN]),
  settingController.update
);

//handle setting switch
route.patch(
  "/",
  authenticate,
  authorize([userRoles.ADMIN]),
  settingController.handleSwitch
);

//get setting data
route.get(
  "/",
  checkAccessWithSecretKey(),
  cacheMiddleware({ keyOrGenerator: "/settings" }),
  settingController.index
);

// --- Thumbnail for login screen (image + video; Flutter picks by network speed) ---

// Public: get thumbnail URLs only (no auth – used on login screen)
route.get("/thumbnail", settingController.getLoginScreenThumbnail);

// Admin: update thumbnail (optional file upload or URLs)
route.patch(
  "/thumbnail",
  authenticate,
  authorize([userRoles.ADMIN]),
  (req, res, next) => {
    if (req.is("multipart/form-data")) {
      return uploadLoginThumbnailToS3(req, res, next);
    }
    next();
  },
  settingController.updateLoginScreenThumbnail
);

module.exports = route;
