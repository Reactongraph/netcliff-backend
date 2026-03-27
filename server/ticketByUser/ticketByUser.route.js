//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../util/checkAccess");

//controller
const ticketBYUserController = require("./ticketByUser.controller");
const { authenticate, authorize, jwtAuthenticate } = require("../middleware/auth.middleware");
const { userRoles } = require("../../util/helper");

//ticket raised by the particular user
route.post(
  "/ticketRaisedByUser",
  jwtAuthenticate,
  authorize([userRoles.USER]),
  ticketBYUserController.ticketRaisedByUser
);

//get all raised tickets for admin
route.get(
  "/raisedTickets",
  authenticate,
  authorize([userRoles.ADMIN]),
  ticketBYUserController.raisedTickets
);

//ticket of particular user solved or not
route.post(
  "/ticketSolve",
  authenticate,
  authorize([userRoles.ADMIN]),
  ticketBYUserController.ticketSolve
);

//get all raised tickets for user
route.get(
  "/",
  jwtAuthenticate,
  authorize([userRoles.USER]),
  ticketBYUserController.myRaisedTickets
);

module.exports = route;
