const express = require("express");
const route = express.Router();

// Controller
const controller = require("./brand.controller");

// Middleware
const { authenticate, authorize } = require("../middleware/auth.middleware");

const { userRoles } = require("../../util/helper");

// Admin routes (protected) - Brand CRUD
route.post("/", authenticate, authorize([userRoles.ADMIN]), controller.create);
route.get("/", authenticate, authorize([userRoles.ADMIN]), controller.getAll);
route.get("/:id", authenticate, authorize([userRoles.ADMIN]), controller.getById);
route.put("/:id", authenticate, authorize([userRoles.ADMIN]), controller.update);
route.delete("/:id", authenticate, authorize([userRoles.ADMIN]), controller.delete);

module.exports = route;
