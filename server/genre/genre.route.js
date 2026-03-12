//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../util/checkAccess");

//controller
const GenreController = require("./genre.controller");
const { authenticate, authorize } = require("../middleware/auth.middleware");
const { userRoles } = require("../../util/helper");

//create genre from TMDB database
//route.post("/getStore", checkAccessWithSecretKey(), GenreController.getStore);

//create genre
route.post("/create", authenticate, authorize([userRoles.ADMIN]), GenreController.store);

//update genre
route.patch("/update", authenticate, authorize([userRoles.ADMIN]), GenreController.update);

//delete genre
route.delete("/delete", authenticate, authorize([userRoles.ADMIN]), GenreController.destroy);

//get genre
route.get("/", checkAccessWithSecretKey(), GenreController.get);

module.exports = route;
