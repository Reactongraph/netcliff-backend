//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../util/checkAccess");

//controller
const trailerController = require("./trailer.controller");
const { authenticate, authorize } = require("../middleware/auth.middleware");
const { userRoles } = require("../../util/helper");

//store trailer
route.post("/create", authenticate, authorize([userRoles.ADMIN]), trailerController.store);

//update trailer
route.patch("/update", authenticate, authorize([userRoles.ADMIN]), trailerController.update);

//delete trailer
route.delete("/delete", authenticate, authorize([userRoles.ADMIN]), trailerController.destroy);

//get trailer
route.get("/", checkAccessWithSecretKey(), trailerController.get);

//get trailer movieId wise for admin panel
route.get("/movieIdWise", authenticate, authorize([userRoles.ADMIN]), trailerController.getIdWise);

module.exports = route;
