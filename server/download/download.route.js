//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../util/checkAccess");

//controller
const downloadController = require("./download.controller");
const { authenticate, authorize, firebaseAuthenticate } = require("../middleware/auth.middleware");
const { userRoles } = require("../../util/helper");

//create download movie
route.post("/create", firebaseAuthenticate, authorize([userRoles.USER]), downloadController.store);

//get userWise downloaded movie
route.get("/userWiseDownload", firebaseAuthenticate, authorize([userRoles.USER]), downloadController.userWiseDownload);

//delete the downloaded movie
route.delete("/deleteDownloadMovie", firebaseAuthenticate, authorize([userRoles.USER]), downloadController.destroy);

module.exports = route;
