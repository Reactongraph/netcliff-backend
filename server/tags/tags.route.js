//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../util/checkAccess");

//controller
const TagsController = require("./tags.controller");
const { authenticate, authorize } = require("../middleware/auth.middleware");
const { userRoles } = require("../../util/helper");

//create tags
route.post("/create", authenticate, authorize([userRoles.ADMIN]), TagsController.store);

//update tags
route.patch("/update", authenticate, authorize([userRoles.ADMIN]), TagsController.update);

//delete tags
route.delete("/delete", authenticate, authorize([userRoles.ADMIN]), TagsController.destroy);

//get tags
route.get("/", checkAccessWithSecretKey(), TagsController.get);

module.exports = route;