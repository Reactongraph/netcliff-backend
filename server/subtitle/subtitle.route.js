//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../util/checkAccess");

//controller
const subtitleController = require("./subtitle.controller");
const { authenticate, authorize, firebaseAuthenticate, addOptionalAuthHeader } = require("../middleware/auth.middleware");
const { userRoles } = require("../../util/helper");

//store subtitle
route.post("/create", authenticate, authorize([userRoles.ADMIN]), subtitleController.store);

//update subtitle status
route.patch("/updateStatus", authenticate, authorize([userRoles.ADMIN]), subtitleController.updateStatus);

//delete subtitle
route.delete("/delete", authenticate, authorize([userRoles.ADMIN]), subtitleController.destroy);

//get all subtitles
route.get("/", checkAccessWithSecretKey(), subtitleController.get);

//get subtitle movieId or episodeId wise for admin panel
route.get("/movieIdWise", authenticate, authorize([userRoles.ADMIN]), subtitleController.getIdWise);

// Mobile API: get subtitles by episode ID
route.get("/episode/:contentId", addOptionalAuthHeader, firebaseAuthenticate, authorize([userRoles.USER, userRoles.ANONYMOUS]), subtitleController.getById);

// Mobile API: get subtitles by movie/series ID
route.get("/:contentId", addOptionalAuthHeader, firebaseAuthenticate, authorize([userRoles.USER, userRoles.ANONYMOUS]), subtitleController.getById);

module.exports = route;
