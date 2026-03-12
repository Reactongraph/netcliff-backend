//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../util/checkAccess");

//controller
const ratingController = require("./rating.controller");
const { authenticate, authorize, firebaseAuthenticate } = require("../middleware/auth.middleware");
const { userRoles } = require("../../util/helper");

//create rating
route.post("/addRating", firebaseAuthenticate, authorize([userRoles.USER]), ratingController.addRating);

//get allMovie avgRating
route.get("/", firebaseAuthenticate, authorize([userRoles.USER]), ratingController.getRating);

module.exports = route;
