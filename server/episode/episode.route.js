//express
const express = require("express");
const route = express.Router();

//controller
const EpisodeController = require("./episode.controller");
const { authenticate, authorize, firebaseAuthenticate, addOptionalAuthHeader } = require("../middleware/auth.middleware");
const { userRoles } = require("../../util/helper");
const checkAccessWithSecretKey = require("../../util/checkAccess");

//create episode
route.post(
  "/create",
  authenticate,
  authorize([userRoles.ADMIN]),
  EpisodeController.store
);

//update episode
route.patch(
  "/update",
  authenticate,
  authorize([userRoles.ADMIN]),
  EpisodeController.update
);

//get all episode
route.get(
  "/",
  authenticate,
  authorize([userRoles.ADMIN]),
  EpisodeController.get
);

//delete episode
route.delete(
  "/delete",
  authenticate,
  authorize([userRoles.ADMIN]),
  EpisodeController.destroy
);

//get season wise episode for admin panel
route.get(
  "/seasonWiseEpisode",
  authenticate,
  authorize([userRoles.ADMIN]),
  EpisodeController.seasonWiseEpisode
);

//get season wise episode for android
route.get(
  "/seasonWiseEpisodeAndroid",
  addOptionalAuthHeader,
  firebaseAuthenticate,
  authorize([userRoles.USER, userRoles.ANONYMOUS]),
  EpisodeController.seasonWiseEpisodeAndroid
);

//get movie only if category web series
route.get("/series", checkAccessWithSecretKey(), EpisodeController.getSeries);

// HLS episode
route.get(
  "/hls-signed-url",
  checkAccessWithSecretKey(),
  EpisodeController.hlsSignedUrl
);

// Update episode status
route.patch("/updateStatus", authenticate, authorize([userRoles.ADMIN]), EpisodeController.updateStatus);

// Increment share counter
route.post(
  "/increment-share", 
  addOptionalAuthHeader,
  firebaseAuthenticate,
  authorize([userRoles.USER, userRoles.ANONYMOUS]),
  EpisodeController.incrementShare
);

// Check episode status (like/favorite) for multiple episodes
route.post(
  "/status",
  addOptionalAuthHeader,
  firebaseAuthenticate,
  authorize([userRoles.USER]),
  EpisodeController.checkEpisodeStatus
);

// Sync episode runtime from Mux assets
route.post(
  "/sync-runtime",
  checkAccessWithSecretKey(),
  EpisodeController.syncRuntimeFromMux
);

module.exports = route;
