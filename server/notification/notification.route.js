//express
const express = require("express");
const route = express.Router();

//controller
const NotificationController = require("./notification.controller");
const { authenticate, authorize, firebaseAuthenticate } = require("../middleware/auth.middleware");
const { userRoles } = require("../../util/helper");

//handle user notification
route.post("/userNotification", firebaseAuthenticate, authorize([userRoles.USER]), NotificationController.handleNotification);

//get notification list
route.get("/list", firebaseAuthenticate, authorize([userRoles.USER]), NotificationController.getNotificationList);

//send notification by admin
route.post("/send", NotificationController.sendNotifications);

module.exports = route;
