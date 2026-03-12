//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../util/checkAccess");

//Controller
const streamController = require("./stream.controller");
const { authenticate, authorize, firebaseAuthenticate } = require("../middleware/auth.middleware");
const { userRoles } = require("../../util/helper");

//create channel by admin if isIptvAPI switch on (true)
route.post("/create", authenticate, authorize([userRoles.ADMIN]), streamController.Store);

//create manual channel by admin
route.post("/manualCreate", authenticate, authorize([userRoles.ADMIN]), streamController.manualStore);

// get channel related data added by admin if isIptvAPI switch on (true)
route.get("/", checkAccessWithSecretKey(), streamController.get);

//update channel
route.patch("/update", authenticate, authorize([userRoles.ADMIN]), streamController.update);

route.patch("/update/stream-key", authenticate, authorize([userRoles.ADMIN]), streamController.updateStreamKey);

//delete channel
route.delete("/delete", authenticate, authorize([userRoles.ADMIN]), streamController.destroy);

//delete channel
route.patch("/updateChannelStatus", authenticate, authorize([userRoles.ADMIN]), streamController.updateChannelStatus);

route.get("/tvChannels", streamController.getTvChannelsClusters);

route.get("/admin", authenticate, authorize([userRoles.ADMIN]), streamController.adminGet);

route.get("/admin/forSelect", checkAccessWithSecretKey(), streamController.adminGetForSelect);

route.post("/program", authenticate, authorize([userRoles.ADMIN]), streamController.createProgram);
route.put("/program/:programId", authenticate, authorize([userRoles.ADMIN]), streamController.updateProgram);

route.delete("/program/:programId", authenticate, authorize([userRoles.ADMIN]), streamController.deleteProgram)

//get signed url for live stream
route.get("/live-stream-signed-url", streamController.liveStreamSignedUrl);

route.get("/favorite", firebaseAuthenticate, authorize([userRoles.USER]), streamController.getFavoritesStream);
route.post("/favorite/:streamId", firebaseAuthenticate, authorize([userRoles.USER]), streamController.addStreamToFavorites)
route.delete("/favorite/:streamId", firebaseAuthenticate, authorize([userRoles.USER]), streamController.removeStreamFromFavorites)

route.post("/create-playlist-for-stream",  streamController.createPlaylistForStream)

route.get("/id-list", authenticate, authorize([userRoles.ADMIN]), streamController.getIdList);

module.exports = route;
