//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../util/checkAccess");

//controller
const MovieController = require("./movie.controller");
const { authenticate, authorize, firebaseAuthenticate, addOptionalAuthHeader } = require("../middleware/auth.middleware");
const { userRoles } = require("../../util/helper");
const { cacheMiddleware } = require("../../util/redisUtils");

//manual create movie by admin
route.post(
  "/create",
  authenticate,
  authorize([userRoles.ADMIN]),
  MovieController.store
);

//manual create series by admin
route.post(
  "/createSeries",
  authenticate,
  authorize([userRoles.ADMIN]),
  MovieController.storeSeries
);

//get details IMDB id or title wise from TMDB database for admin
route.get(
  "/getStoredetails",
  authenticate,
  authorize([userRoles.ADMIN]),
  MovieController.getStoredetails
);

//create movie from TMDB database
route.post(
  "/getStore",
  authenticate,
  authorize([userRoles.ADMIN]),
  MovieController.getStore
);

//update movie or weSeries
route.patch(
  "/update",
  authenticate,
  authorize([userRoles.ADMIN]),
  MovieController.update
);

//view API
route.patch("/view", checkAccessWithSecretKey(), MovieController.addView);

//get all top10 through view for android
route.get(
  "/Top10",
  checkAccessWithSecretKey(),
  // firebaseAuthenticate,
  // authorize([userRoles.USER]),
  MovieController.getAllTop10
);

//get all top10 through view for admin panel
route.get(
  "/AllTop10",
  authenticate,
  authorize([userRoles.ADMIN]),
  MovieController.getAllCategoryTop10
);

//newReleased switch
route.patch(
  "/isNewRelease",
  authenticate,
  authorize([userRoles.ADMIN]),
  MovieController.isNewRelease
);

//get all newReleased on app
route.get(
  "/isNewRelease",
  checkAccessWithSecretKey(),
  // firebaseAuthenticate,
  // authorize([userRoles.USER]),
  MovieController.getAllNewRelease
);

//get free or premium movie(all category) wise trailer or episode for android
route.get(
  "/:_id/detail",
  addOptionalAuthHeader,
  firebaseAuthenticate,
  authorize([userRoles.USER, userRoles.ANONYMOUS]),
  cacheMiddleware({
    keyOrGenerator: (req) => req.originalUrl?.split("?")[0],
    skipReturn: true
  }),
  MovieController.MovieDetail
);

//get movie(all category) wise trailer or episode for backend
route.get(
  "/details",
  authenticate,
  authorize([userRoles.ADMIN]),
  MovieController.MovieDetails
);

//get year for movie or series
route.get("/getYear", checkAccessWithSecretKey(), MovieController.getYear);

//search Movie Name
route.get(
  "/search",
  // firebaseAuthenticate,
  // authorize([userRoles.USER]),
  MovieController.search
);

//get all movie for android
route.get(
  "/getMovie",
  firebaseAuthenticate,
  authorize([userRoles.USER]),
  MovieController.getMovie
);

//get all movie for admin panel
route.get(
  "/all",
  authenticate,
  authorize([userRoles.ADMIN]),
  MovieController.getAll
);

//get all more like this movie
route.get(
  "/allLikeThis",
  firebaseAuthenticate,
  authorize([userRoles.USER]),
  MovieController.getAllLikeThis
);

//delete movie for admin panel
route.delete(
  "/delete",
  authenticate,
  authorize([userRoles.ADMIN]),
  MovieController.destroy
);

//get all movie filterWise
route.post(
  "/filterWise",
  checkAccessWithSecretKey(),
  MovieController.MovieFilterWise
);

//best ComedyMovie for android (home)
route.get(
  "/ComedyMovie",
  checkAccessWithSecretKey(),
  MovieController.bestComedyMovie
);

//get topRated movie or webseries for android
route.get(
  "/topRated",
  checkAccessWithSecretKey(),
  // firebaseAuthenticate,
  // authorize([userRoles.USER]),
  MovieController.getAllTopRated
);

//directly upload images from TMDb to S3
//route.post("/getStore", checkAccessWithSecretKey(), MovieController.getStoreFromTMDBToSpace);

// HLS movie
route.get(
  "/hls-signed-url",
  addOptionalAuthHeader,
  firebaseAuthenticate,
  authorize([userRoles.USER, userRoles.ANONYMOUS]),
  MovieController.hlsSignedUrl
);

// Batch HLS signed URLs
route.post(
  "/hls-signed-url",
  addOptionalAuthHeader,
  firebaseAuthenticate,
  authorize([userRoles.USER, userRoles.ANONYMOUS]),
  MovieController.batchHlsSignedUrl
);

// Get user content status (favorite/like) for movies and episodes
route.post(
  "/content-status",
  firebaseAuthenticate,
  authorize([userRoles.USER]),
  MovieController.getUserContentStatus
);

// Admin route for HLS signed URL - bypasses user restrictions
route.get(
  "/hls-signed-url/admin",
  authenticate,
  authorize([userRoles.ADMIN]),
  MovieController.hlsSignedUrl
);

route.get(
  "/hls-signed-cookie",
  checkAccessWithSecretKey(),
  MovieController.hlsSignedCookie
);

route.get(
  "/",
  firebaseAuthenticate,
  authorize([userRoles.USER]),
  MovieController.getByFilter
);

// featured
route.get(
  "/featured",
  checkAccessWithSecretKey(),
  // firebaseAuthenticate,
  // authorize([userRoles.USER]),
  MovieController.getFeatured
);

// featured
route.get(
  "/id-list",
  authenticate,
  authorize([userRoles.ADMIN]),
  MovieController.getIdList
);

// Update movie status
route.patch("/updateStatus", authenticate, MovieController.updateStatus);

//get movie(all category) wise trailer or episode for backend
route.get(
  "/gam-config",
  firebaseAuthenticate,
  authorize([userRoles.USER]),
  MovieController.getGamConfig
);


module.exports = route;
