//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../util/checkAccess");

//Controller
const SeasonController = require("./season.controller");
const { userRoles } = require("../../util/helper");
const { authorize, authenticate } = require("../middleware/auth.middleware");

//get season
route.get("/", checkAccessWithSecretKey(), SeasonController.get);

//get season particular movieId wise
route.get("/movieIdWise", checkAccessWithSecretKey(), SeasonController.getIdWise);

//create season
route.post("/create", authenticate, authorize([userRoles.ADMIN]), SeasonController.store);

//update season
route.patch("/update", authenticate, authorize([userRoles.ADMIN]), SeasonController.update);

//delete season
route.delete("/delete", authenticate, authorize([userRoles.ADMIN]), SeasonController.destroy);

module.exports = route;
