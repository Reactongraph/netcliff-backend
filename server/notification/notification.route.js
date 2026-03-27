//express
const express = require("express");
const route = express.Router();

//controller
const NotificationController = require("./notification.controller");
const { authenticate, authorize, jwtAuthenticate } = require("../middleware/auth.middleware");
const { userRoles } = require("../../util/helper");

//handle user notification
route.post("/userNotification", jwtAuthenticate, authorize([userRoles.USER]), NotificationController.handleNotification);

//get notification list
route.get("/list", jwtAuthenticate, authorize([userRoles.USER]), NotificationController.getNotificationList);

//send notification by admin
route.post("/send", authenticate, authorize([userRoles.ADMIN]), NotificationController.sendNotifications);

module.exports = route;
