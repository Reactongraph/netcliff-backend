//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../util/checkAccess");

//controller
const subtitleController = require("./subtitle.controller");
const { authenticate, authorize } = require("../middleware/auth.middleware");
const { userRoles } = require("../../util/helper");

//store trailer
route.post("/create", authenticate, authorize([userRoles.ADMIN]), subtitleController.store);

//delete trailer
route.delete("/delete", authenticate, authorize([userRoles.ADMIN]), subtitleController.destroy);

//get trailer
route.get("/", checkAccessWithSecretKey(), subtitleController.get);

//get trailer movieId wise for admin panel
route.get("/movieIdWise", authenticate, authorize([userRoles.ADMIN]), subtitleController.getIdWise);

module.exports = route;
