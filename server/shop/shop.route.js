const express = require("express");
const route = express.Router();

// Controller
const controller = require("./shop.controller");

// Middleware
const { firebaseAuthenticate, authorize } = require("../middleware/auth.middleware");
const { userRoles } = require("../../util/helper");

// All shop routes require user authentication

// Get shop stats (must be before GET /:campaignId)
route.get("/stats", firebaseAuthenticate, authorize([userRoles.USER]), controller.getShopStats);

// Save Aston to shop
route.post("/", firebaseAuthenticate, authorize([userRoles.USER]), controller.saveAston);

// Get all saved Astons (list) - with query params to differentiate from GET /:campaignId
route.get("/", firebaseAuthenticate, authorize([userRoles.USER]), controller.getSavedAstons);

// Check if an Aston is saved
route.get("/:campaignId", firebaseAuthenticate, authorize([userRoles.USER]), controller.checkAstonSaved);

// Remove Aston from shop by item ID
route.delete("/:itemId", firebaseAuthenticate, authorize([userRoles.USER]), controller.removeAston);

module.exports = route;
