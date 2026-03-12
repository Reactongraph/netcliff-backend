//express
const express = require("express");
const route = express.Router();

//controller
const controller = require("./banner.controller");
const { authenticate, authorize, firebaseAuthenticate } = require("../middleware/auth.middleware");
const checkAccessWithSecretKey = require("../../util/checkAccess");
const { userRoles } = require("../../util/helper");

// Admin routes (protected)
route.post("/", authenticate, authorize([userRoles.ADMIN]), controller.create);
route.get("/", authenticate, authorize([userRoles.ADMIN]), controller.getAll);
route.get("/:bannerId", authenticate, authorize([userRoles.ADMIN]), controller.getById);
route.put("/:bannerId", authenticate, authorize([userRoles.ADMIN]), controller.update);
route.delete("/:bannerId", authenticate, authorize([userRoles.ADMIN]), controller.delete);
route.put("/:bannerId/toggle-status", authenticate, authorize([userRoles.ADMIN]), controller.toggleStatus);
route.put("/reorder", authenticate, authorize([userRoles.ADMIN]), controller.reorder);

// Public route for active banners (for frontend)
route.get("/active/list", checkAccessWithSecretKey(), controller.getActiveBanners);

module.exports = route; 