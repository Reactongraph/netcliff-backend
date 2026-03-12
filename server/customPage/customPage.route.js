const express = require("express");
const route = express.Router();

const checkAccessWithSecretKey = require("../../util/checkAccess");
const { cacheMiddleware } = require("../../util/redisUtils");

const CustomPageController = require("./customPage.controller");
const { userRoles } = require("../../util/helper");
const { authorize, authenticate } = require("../middleware/auth.middleware");

// Get custom page config with caching
route.get(
    "/",
    checkAccessWithSecretKey(),
    cacheMiddleware({
        keyOrGenerator: (req) => {
            const type = req.query.type || 'subscription';
            return `/custom-page:type=${type}`;
        },
    }),
    CustomPageController.getCustomPage
);

// Get payment plan page config
route.get(
    "/paymentPlanConfig",
    checkAccessWithSecretKey(),
    CustomPageController.getCustomPage
);

// Update custom page config
route.patch("/", authenticate, authorize([userRoles.ADMIN]), CustomPageController.updateCustomPage);

module.exports = route;
