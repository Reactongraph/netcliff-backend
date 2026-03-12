//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../util/checkAccess");

//controller
const CommentController = require("./comment.controller");
const { authenticate, authorize, firebaseAuthenticate } = require("../middleware/auth.middleware");
const { userRoles } = require("../../util/helper");

//create comment
route.post("/create", firebaseAuthenticate, authorize([userRoles.USER]), CommentController.store);

//get comment list of movie for android
route.get("/getComment", firebaseAuthenticate, authorize([userRoles.USER]), CommentController.getComment);

//get comment list of movie for admin panel
route.get("/getComments", authenticate, authorize([userRoles.ADMIN]), CommentController.getComments);

//delete comment
route.delete("/", authenticate, authorize([userRoles.ADMIN]), CommentController.destroy);

module.exports = route;
