//express
const express = require("express");
const route = express.Router();

//admin middleware
const AdminMiddleware = require("../middleware/admin.middleware");

//controller
const AdminController = require("./admin.controller");
const { authenticate, authorize } = require("../middleware/auth.middleware");
const { userRoles } = require("../../util/helper");

//create admin
route.post("/create", AdminController.store);

//admin login
route.post("/login", AdminController.login);

//get admin profile
route.get("/profile", authenticate, authorize([userRoles.ADMIN]), AdminController.getProfile);

//update admin profile email and name
route.patch("/", authenticate, authorize([userRoles.ADMIN]), AdminController.update);

//update admin Profile Image
route.patch("/updateImage", authenticate, authorize([userRoles.ADMIN]), AdminController.updateImage);

//update admin password
route.put("/updatePassword", authenticate, authorize([userRoles.ADMIN]), AdminController.updatePassword);

//forgrt admin password (send email for forgot the password)
route.post("/forgetPassword", AdminController.forgotPassword);

//set admin password
route.post("/setPassword", AdminController.setPassword);



module.exports = route;
