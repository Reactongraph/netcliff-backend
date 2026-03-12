//movie model
const Movie = require("./movie.model");

//mongoose
const mongoose = require("mongoose");

//axios
const axios = require("axios");

//fetch
const fetch = require("node-fetch");

//deleteFromAzure
const { deleteFromAzure } = require("../../util/deleteFromAzure");

//import model
const User = require("../user/user.model");
const Region = require("../region/region.model");
const Genre = require("../genre/genre.model");
const Favorite = require("../favorite/favorite.model");
const Like = require('../like/like.model')
const Episode = require("../episode/episode.model");
const Trailer = require("../trailer/trailer.model");
const Role = require("../role/role.model");
const Season = require("../season/season.model");
const Language = require("../language/language.model");
const Setting = require("../setting/setting.model");

const { getFromCache, setCache } = require('../../util/redisUtils');

//youtubeUrl
const youtubeUrl = "https://www.youtube.com/watch?v=";

//imageUrl
const imageUrl = "https://www.themoviedb.org/t/p/original";

const {
  cloudFrontSignedCookies,
  createUniqueResourceId,
} = require("../../util/hls");
const { uploadTmdbImageToS3 } = require("../../util/aws");
const {
  populateGenre,
  populateLanguage,
  populateRegion,
  blockCountryWise,
  populateSubtitle,
  populateTrailers,
} = require("./movie.aggregations");
const { muxClient, muxDrmClient } = require("../../config/mux");
const { userRoles } = require("../../util/helper");
const { S3 } = require("../../util/awsServices");
const { CONTENT_STATUS } = require("../../util/constants");

//manual create movie by admin
exports.store = async (req, res) => {
  try {
    if (
      !req.body.title ||
      !req.body.year ||
      !req.body.description ||
      !req.body.region ||
      !req.body.genre ||
      !req.body.type ||
      !req.body.runtime ||
      !req.body.videoType ||
      !req.body.image ||
      !req.body.thumbnail ||
      !req.body.language ||
      !req.body.maturity ||
      !req.body.videoQuality ||
      !req.body.contentRating
    ) {
      return res
        .status(200)
        .json({ status: false, message: "Oops ! Invalid details!" });
    }

    // link is required if videoType is not 8
    if (req.body.videoType != 8 && !req.body.link) {
      return res
        .status(200)
        .json({ status: false, message: "Oops ! Invalid details!" });
    }

    // hlsFileName & hlsFileExt is required if videoType is 8
    if (
      req.body.videoType == 8 &&
      (!req.body.hlsFileName || !req.body.hlsFileExt)
    ) {
      return res
        .status(200)
        .json({ status: false, message: "Oops ! Invalid details!" });
    }

    const [region, genre] = await Promise.all([
      Region.findById(req.body.region),
      Genre.findById(req.body.genre),
    ]);

    if (!region)
      return res
        .status(200)
        .json({ status: false, message: "Region does not found!" });
    if (!genre)
      return res
        .status(200)
        .json({ status: false, message: "Genre does not found!" });

    const movie = new Movie();
    movie.videoType = req.body.videoType;
    movie.link = req.body.link;
    movie.image = req.body.image;
    movie.landscapeImage = req.body.landscapeImage;
    movie.thumbnail = req.body.thumbnail;
    movie.title = req.body.title;
    movie.runtime = req.body.runtime;
    movie.year = req.body.year;
    movie.description = req.body.description;
    movie.type = req.body.type;
    movie.date = new Date().toLocaleString("en-US", {
      timeZone: "Asia/Kolkata",
    });
    movie.region = region._id;
    movie.media_type = "movie";
    movie.updateType = 1;
    movie.convertUpdateType.image = 1;
    movie.convertUpdateType.landscapeImage = 1;
    movie.convertUpdateType.thumbnail = 1;
    movie.convertUpdateType.link = 1;

    movie.language = req.body.language;
    movie.maturity = req.body.maturity;
    movie.videoQuality = req.body.videoQuality;
    movie.contentRating = req.body.contentRating;
    movie.exclusive = req.body.exclusive;
    movie.featured = req.body.featured;
    movie.newReleased = req.body.newReleased;

    // SEO
    movie.seoTitle = req.body.seoTitle;
    movie.seoDescription = req.body.seoDescription;
    movie.seoTags = req.body.seoTags;

    // geo blocking
    movie.blockedCountries = req.body.blockedCountries;

    // Movie badges
    if (req.body.badges) {
      movie.badges = req.body.badges;
      movie.isCronBadge = false;
    }

    // HLS
    if (req.body.videoType == 8) {
      movie.hlsFileName = req.body.hlsFileName;
      movie.wwprResourceId = createUniqueResourceId("wwpr");
      movie.fpResourceId = createUniqueResourceId("fp");

      const inputFile = `s3://${process.env.bucketName}/raw/${req.body.hlsFileName}.${req.body.hlsFileExt}`;
      const outputBucket = `s3://${process.env.bucketName}/transcoded`;
      const outputFolder = req.body.hlsFileName;

      // await createAndTriggerTranscodingJob(
      //   inputFile,
      //   outputBucket,
      //   outputFolder,
      //   movie.wwprResourceId,
      //   movie.fpResourceId
      // );
    }

    //genre
    const multipleGenre = req.body.genre.toString().split(",");
    movie.genre = multipleGenre;

    const genreNames = await Genre.find({ _id: { $in: multipleGenre } }).distinct("name");
    movie.genres = genreNames;

    //tags
    if (req.body.tags && req.body.tags.length > 0) {
      const multipleTags = req.body.tags.toString().split(",");
      movie.tags = multipleTags;
    }

    await movie.save();

    const data = await Movie.findById(movie._id).populate([
      { path: "region", select: "name" },
      { path: "genre", select: "name" },
      { path: "tags", select: "name" },
      { path: "language", select: "name" },
    ]);

    res.status(200).json({
      status: true,
      message: "Movie has been uploaded by admin!",
      movie: data,
    });

    //New release movie related notification --- Commented for now
    // const userId = await User.find({
    //   "notification.NewReleasesMovie": true,
    // }).distinct("_id");

    // const userTokens = await User.find({
    //   "notification.NewReleasesMovie": true,
    // }).distinct("fcmToken");

    // if (userTokens.length !== 0) {
    //   const adminPromise = await admin;

    //   // Send notifications to all users with valid tokens
    //   const sendPromises = userTokens.filter(token => token).map(async (token) => {
    //     const payload = {
    //       token: token,
    //       notification: {
    //         title: `New Release`,
    //         body: "Stay Tuned: New Movie Alert!",
    //       },
    //     };

    //     try {
    //       const response = await adminPromise.messaging().send(payload);
    //       console.log("Successfully sent notification to token:", token, "Response:", response);
    //       return { success: true, token, response };
    //     } catch (error) {
    //       console.log("Error sending notification to token:", token, "Error:", error);
    //       return { success: false, token, error };
    //     }
    //   });

    //   try {
    //     const results = await Promise.allSettled(sendPromises);
    //     console.log("Notification send results:", results);

    //     // Save notifications to database for all users
    //     await userId.map(async (id) => {
    //       const notification = new Notification();
    //       notification.title = movie.title;
    //       notification.message = `${movie.title} is Here! Don't Miss It!`;
    //       notification.userId = id;
    //       notification.movieId = movie._id;
    //       notification.image = movie.image;
    //       notification.date = new Date().toLocaleString("en-US", {
    //         timeZone: "Asia/Kolkata",
    //       });
    //       await notification.save();
    //     });
    //   } catch (error) {
    //     console.log("Error in notification process:", error);
    //   }
    // }
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

//manual create web series by admin
exports.storeSeries = async (req, res) => {
  try {
    if (
      !req.body ||
      !req.body.title ||
      !req.body.thumbnail
    ) {
      return res
        .status(200)
        .json({ status: false, message: "Title and thumbnail are required!" });
    }

    const movie = new Movie();

    movie.image = req.body.image || "";
    movie.landscapeImage = req.body.landscapeImage || "";
    movie.thumbnail = req.body.thumbnail;
    movie.title = req.body.title;
    movie.year = req.body.year || "";
    movie.description = req.body.description || "";
    movie.type = req.body.type || "Premium";
    movie.date = new Date().toLocaleString("en-US", {
      timeZone: "Asia/Kolkata",
    });
    movie.media_type = "tv";
    movie.updateType = req.body.updateType || 1;
    movie.convertUpdateType = req.body.convertUpdateType || {
      image: 1,
      landscapeImage: 1,
      thumbnail: 1,
      link: 0
    };

    movie.contentRating = req.body.contentRating || Math.random() * 10;
    movie.exclusive = req.body.exclusive || false;
    movie.featured = req.body.featured || false;
    movie.newReleased = req.body.newReleased || false;
    movie.isCachedOnHome = req.body.isCachedOnHome || false;
    movie.seoTitle = req.body.seoTitle || "";
    movie.seoDescription = req.body.seoDescription || "";
    movie.seoTags = req.body.seoTags || [];
    movie.blockedCountries = req.body.blockedCountries || [];
    movie.ads = req.body.ads;    

    // Only set region if provided and not empty
    if (req.body.region && req.body.region !== "") {
      movie.region = req.body.region;
    }

    // Only set maturity if provided and not empty
    if (req.body.maturity && req.body.maturity !== "") {
      movie.maturity = req.body.maturity;
    }

    // Only set videoQuality if provided and not empty
    if (req.body.videoQuality && req.body.videoQuality !== "") {
      movie.videoQuality = req.body.videoQuality;
    }

    //genre
    if (req.body.genre && req.body.genre.length > 0) {
      const multipleGenre = Array.isArray(req.body.genre)
        ? req.body.genre
        : req.body.genre.toString().split(",");
      movie.genre = multipleGenre;

      const genreNames = await Genre.find({ _id: { $in: multipleGenre } }).distinct("name");
      movie.genres = genreNames;
    } else {
      movie.genre = [];
      movie.genres = [];
    }

    //tags
    if (req.body.tags && req.body.tags.length > 0) {
      const multipleTags = Array.isArray(req.body.tags)
        ? req.body.tags
        : req.body.tags.toString().split(",");
      movie.tags = multipleTags;
    } else {
      movie.tags = [];
    }

    //language
    if (req.body.language && req.body.language.length > 0) {
      const multipleLanguage = Array.isArray(req.body.language)
        ? req.body.language
        : req.body.language.toString().split(",");
      movie.language = multipleLanguage;
    } else {
      movie.language = [];
    }

    await movie.save();

    const defaultSeason = new Season();
    defaultSeason.name = "S1";
    defaultSeason.seasonNumber = 1;
    defaultSeason.episodeCount = 0;
    defaultSeason.image = "";
    defaultSeason.releaseDate = "";
    defaultSeason.movie = movie._id;
    defaultSeason.updateType = 1; // Manual creation
    await defaultSeason.save();

    const data = await Movie.findById(movie._id).populate([
      { path: "region", select: "name" },
      { path: "genre", select: "name" },
      { path: "tags", select: "name" },
      { path: "language", select: "name" },
    ]);

    res.status(200).json({
      status: true,
      message: "WebSeries Created Successfully!",
      movie: data,
    });

    //New release movie related notification  - Commented for now
    // const userId = await User.find({
    //   "notification.NewReleasesMovie": true,
    // }).distinct("_id");

    // const userTokens = await User.find({
    //   "notification.NewReleasesMovie": true,
    // }).distinct("fcmToken");

    // if (userTokens.length !== 0) {
    //   const adminPromise = await admin;

    //   // Send notifications to all users with valid tokens
    //   const sendPromises = userTokens.filter(token => token).map(async (token) => {
    //     const payload = {
    //       token: token,
    //       notification: {
    //         title: `New Release`,
    //         body: "Get Ready: Latest WebSeries Watchlist is Here!",
    //       },
    //     };

    //     try {
    //       const response = await adminPromise.messaging().send(payload);
    //       console.log("Successfully sent notification to token:", token, "Response:", response);
    //       return { success: true, token, response };
    //     } catch (error) {
    //       console.log("Error sending notification to token:", token, "Error:", error);
    //       return { success: false, token, error };
    //     }
    //   });

    //   try {
    //     const results = await Promise.allSettled(sendPromises);
    //     console.log("Notification send results:", results);

    //     // Save notifications to database for all users
    //     await userId.map(async (id) => {
    //       const notification = new Notification();
    //       notification.title = movie.title;
    //       notification.message = `Get Ready to Binge: New ${movie.title} Added Today!`;
    //       notification.userId = id;
    //       notification.movieId = movie._id;
    //       notification.image = movie.image;
    //       notification.date = new Date().toLocaleString("en-US", {
    //         timeZone: "Asia/Kolkata",
    //       });
    //       await notification.save();
    //     });
    //   } catch (error) {
    //     console.log("Error in notification process:", error);
    //   }
    // }
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

//get details IMDB id or title wise from TMDB database for admin
exports.getStoredetails = async (req, res) => {
  try {
    if ((!req.query.title || !req.query.IMDBid) && !req.query.type) {
      return res
        .status(200)
        .json({ status: false, message: "Oops ! Invalid details!" });
    }

    const options = {
      method: "GET",
      headers: {
        accept: "application/json",
        Authorization: `Bearer ${process.env.Authorization}`,
      },
    };

    if (!process.env.Authorization) {
      return res
        .status(200)
        .json({ status: false, message: "TMDB credentials must be requried!" });
    }

    if (req.query.title) {
      //get movie or WebSeries details (https://api.themoviedb.org/3/search/movie?api_key=67af5e631dcbb4d0981b06996fcd47bc&language=en-US&page=1&include_adult=false&query=titanic)

      const url = `https://api.themoviedb.org/3/search/${req.query.type.toUpperCase() === "WEBSERIES" ? "tv" : "movie"
        }?query=${req.query.title}&include_adult=false&language=en-US&page=1`;

      const result = await fetch(url, options).then((response) =>
        response.json()
      );

      if (!result.results || result.results.length === 0) {
        return res.status(200).json({
          status: false,
          message: "No data found!",
        });
      }

      //get trailer API (https://api.themoviedb.org/3/movie/595/videos?api_key=67af5e631dcbb4d0981b06996fcd47bc&language=en-US)

      const trailerFetchUrl = `https://api.themoviedb.org/3/${req.query.type.toUpperCase() === "WEBSERIES" ? "tv" : "movie"
        }/${req.query.type.toUpperCase() === "WEBSERIES"
          ? result.results[0].id
          : result.results[0].id
        }/videos?language=en-US`;

      const trailerResult = await fetch(trailerFetchUrl, options).then(
        (response) => response.json()
      );

      if (req.query.type.toUpperCase() === "WEBSERIES") {
        var series = {
          title: result.results[0].name,
          description: result.results[0].overview,
          year: result.results[0].first_air_date,
          image: imageUrl + result.results[0].backdrop_path,
          thumbnail: imageUrl + result.results[0].poster_path,
          media_type: result.results[0].media_type,
          TmdbMovieId: result.results[0].id,
          genre: result.results[0].genre_ids,
          region: result.results[0].origin_country,
          trailerUrl:
            trailerResult.results.length > 0
              ? youtubeUrl + trailerResult.results[0]?.key
              : null,
        };

        //genre for series
        const genreIds = await result.results[0].genre_ids.map(async (id) => {
          const genere = await Genre.findOne({ uniqueId: id });
          return genere;
        });

        await Promise.all(genreIds).then(function (results) {
          series.genre = results;
        });

        series.genre = series.genre.filter((e) => !!e);

        //region for series
        const regionIds = await result.results[0].origin_country.map(
          async (id) => {
            const region = await Region.findOne({ uniqueId: id });
            return region;
          }
        );

        await Promise.all(regionIds).then(function (results) {
          series.region = results;
        });
      } else {
        var movie = {
          title: result.results[0].title,
          description: result.results[0].overview,
          year: result.results[0].release_date,
          image: imageUrl + result.results[0].backdrop_path,
          thumbnail: imageUrl + result.results[0].poster_path,
          media_type: result.results[0].media_type,
          TmdbMovieId: result.results[0].id,
          genre: result.results[0].genre_ids,
          trailerUrl:
            trailerResult.results.length > 0
              ? youtubeUrl + trailerResult.results[0]?.key
              : null,
        };

        //genre for movie
        const genreIds = await result.results[0].genre_ids.map(async (id) => {
          const genere = await Genre.findOne({ uniqueId: id });
          return genere;
        });

        await Promise.all(genreIds).then(function (results) {
          movie.genre = results;
        });

        movie.genre = movie.genre.filter((e) => !!e);
      }

      return res
        .status(200)
        .json({ status: true, message: "Success", movie, series });
    } else if (req.query.IMDBid) {
      //IMDB id Wise API called (https://api.themoviedb.org/3/find/tt27510174?api_key=67af5e631dcbb4d0981b06996fcd47bc&language=en&external_source=imdb_id)

      const url = `https://api.themoviedb.org/3/find/${req.query.IMDBid}?external_source=imdb_id`;

      const result = await fetch(url, options).then((response) =>
        response.json()
      );

      if (
        (req.query.type.toUpperCase() === "WEBSERIES" &&
          result.tv_results.length === 0) ||
        (req.query.type.toUpperCase() === "MOVIE" &&
          result.movie_results.length === 0)
      ) {
        return res.status(200).json({
          status: false,
          message: "No data found!",
        });
      }

      //get trailer API (https://api.themoviedb.org/3/movie/595/videos?api_key=67af5e631dcbb4d0981b06996fcd47bc&language=en-US)

      const trailerFetchUrl = `https://api.themoviedb.org/3/${req.query.type.toUpperCase() === "WEBSERIES" ? "tv" : "movie"
        }/${req.query.type.toUpperCase() === "WEBSERIES"
          ? result.tv_results[0].id
          : result.movie_results[0].id
        }/videos?language=en-US`;

      const trailerResult = await fetch(trailerFetchUrl, options).then(
        (response) => response.json()
      );

      if (req.query.type.toUpperCase() === "WEBSERIES") {
        var series = {
          title: result.tv_results[0].name,
          description: result.tv_results[0].overview,
          year: result.tv_results[0].first_air_date,
          image: imageUrl + result.tv_results[0].backdrop_path,
          thumbnail: imageUrl + result.tv_results[0].poster_path,
          media_type: result.tv_results[0].media_type,
          TmdbMovieId: result.tv_results[0].id,
          genre: result.tv_results[0].genre_ids,
          region: result.tv_results[0].origin_country,
          trailerUrl:
            trailerResult.results.length > 0
              ? youtubeUrl + trailerResult.results[0]?.key
              : null,
        };

        //genre for series
        const genreIds = await result.tv_results[0].genre_ids.map(
          async (id) => {
            const genere = await Genre.findOne({ uniqueId: id });
            return genere;
          }
        );

        await Promise.all(genreIds).then(function (results) {
          series.genre = results;
        });

        series.genre = series.genre.filter((e) => !!e);

        //region for series
        const regionIds = await result.tv_results[0].origin_country.map(
          async (id) => {
            const region = await Region.findOne({ uniqueId: id });
            return region;
          }
        );

        await Promise.all(regionIds).then(function (results) {
          series.region = results;
        });
      } else {
        var movie = {
          title: result.movie_results[0].title,
          description: result.movie_results[0].overview,
          year: result.movie_results[0].release_date,
          image: imageUrl + result.movie_results[0].backdrop_path,
          thumbnail: imageUrl + result.movie_results[0].poster_path,
          media_type: result.movie_results[0].media_type,
          TmdbMovieId: result.movie_results[0].id,
          genre: result.movie_results[0].genre_ids,
          trailerUrl:
            trailerResult.results.length > 0
              ? youtubeUrl + trailerResult.results[0]?.key
              : null,
        };

        //genre for movie
        const genreIds = await result.movie_results[0].genre_ids.map(
          async (id) => {
            const genere = await Genre.findOne({ uniqueId: id });
            return genere;
          }
        );

        await Promise.all(genreIds).then(function (results) {
          movie.genre = results;
        });

        movie.genre = movie.genre.filter((e) => !!e);
      }

      return res
        .status(200)
        .json({ status: true, message: "Success", movie, series });
    } else {
      return res.status(200).json({
        status: false,
        message: "title or IMDBid must be passed valid!",
      });
    }
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json({ status: false, error: error.message || "Internal Server error" });
  }
};

//create movie or webSeries from TMDB database
exports.getStore = async (req, res) => {
  try {
    if (!req.query.TmdbMovieId || !req.query.type) {
      return res
        .status(200)
        .json({ status: false, message: "Oops ! Invalid details." });
    }

    const options = {
      method: "GET",
      headers: {
        accept: "application/json",
        Authorization: `Bearer ${process.env.Authorization}`,
      },
    };

    if (!process.env.Authorization) {
      return res
        .status(200)
        .json({ status: false, message: "TMDB credentials must be requried!" });
    }

    //get movie or WebSeries details (https://api.themoviedb.org/3/tv/89113?api_key=67af5e631dcbb4d0981b06996fcd47bc&language=en-US)

    const url = `https://api.themoviedb.org/3/${req.query.type.toUpperCase() === "WEBSERIES" ? "tv" : "movie"
      }/${req.query.TmdbMovieId}?language=en-US`;

    const result = await fetch(url, options).then((response) =>
      response.json()
    );

    if (!result) {
      return res.status(200).json({
        status: false,
        message: "No data found!",
      });
    }

    if (req.query.type.toUpperCase() === "WEBSERIES") {
      const series = new Movie();

      const imageS3Url = await uploadTmdbImageToS3(
        imageUrl + result.backdrop_path,
        `KalingoseriesImage`
      );
      const thumbnailS3Url = await uploadTmdbImageToS3(
        imageUrl + result.poster_path,
        `KalingoseriesThumbnail`
      );

      //genre for series
      const genereArray = await result.genres.map(async (data) => {
        const genereId = await Genre.findOne({ uniqueId: data.id });
        return genereId?._id;
      });

      await Promise.all(genereArray).then(function (results) {
        series.genre = results;
      });

      series.genre = series.genre.filter((e) => !!e);

      //region for series
      const regionArray = await result.production_countries.map(
        async (data) => {
          const regionId = await Region.findOne({
            uniqueID: data.iso_3166_1,
          });
          return regionId._id;
        }
      );

      await Promise.all(regionArray).then(function (results) {
        series.region = results[0];
      });

      //seasonData and episodeData
      await result.seasons.map(async (data) => {
        //seasonData
        const season = new Season();
        season.name = data.name;
        season.seasonNumber = data.season_number;
        season.episodeCount = data.episode_count;
        season.image = imageUrl + data.poster_path;
        season.releaseDate = data.air_date;
        season.TmdbSeasonId = data.id;
        season.movie = series._id;
        await season.save();

        //episodeData (https://api.themoviedb.org/3/tv/89113/season/1?api_key=67af5e631dcbb4d0981b06996fcd47bc&language=en-US)

        const episodeUrl = `https://api.themoviedb.org/3/tv/${req.query.TmdbMovieId
          }/season/${[data.season_number]}?language=en-US`;

        const episodeResult = await fetch(episodeUrl, options).then(
          (response) => response.json()
        );

        await episodeResult.episodes.map(async (data) => {
          const episode = new Episode();
          episode.name = data.name;
          episode.episodeNumber = data.episode_number;
          episode.image = imageUrl + data.still_path;
          episode.seasonNumber = data.season_number;
          episode.runtime = data.runtime;
          episode.TmdbMovieId = data.show_id;
          episode.movie = series._id;
          episode.season = season._id;
          await episode.save();
        });
      });

      //trailer for series (https://api.themoviedb.org/3/tv/595/videos?api_key=67af5e631dcbb4d0981b06996fcd47bc&language=en-US)

      const trailerUrl = `https://api.themoviedb.org/3/tv/${req.query.TmdbMovieId}/videos?language=en-US`;

      const trailerResult = await fetch(trailerUrl, options).then((response) =>
        response.json()
      );

      await trailerResult.results.map(async (data) => {
        const trailerData = new Trailer();
        trailerData.name = data.name;
        trailerData.size = data.size;
        trailerData.type = data.type;
        trailerData.videoUrl = youtubeUrl + data.key;
        trailerData.key = data.key;
        trailerData.trailerImage = imageS3Url;
        trailerData.movie = series._id;
        await trailerData.save();
      });

      //credit(cast) for series (https://api.themoviedb.org/3/tv/89113/aggregate_credits?api_key=67af5e631dcbb4d0981b06996fcd47bc&language=en-US)
      const castUrl = `https://api.themoviedb.org/3/tv/${req.query.TmdbMovieId}/aggregate_credits?language=en-US`;

      const castResult = await fetch(castUrl, options).then((response) =>
        response.json()
      );

      await castResult.cast.map(async (data) => {
        const castData = new Role();
        castData.name = data.name;
        castData.image = imageUrl + data.profile_path;
        castData.position = data.known_for_department;
        castData.movie = series._id;
        await castData.save();
      });

      series.title = result.name;
      series.year = result.first_air_date;
      series.description = result.overview;
      series.image = imageS3Url;
      series.thumbnail = thumbnailS3Url;
      series.TmdbMovieId = result.id;
      series.media_type = "tv";
      series.date = new Date().toLocaleString("en-US", {
        timeZone: "Asia/Kolkata",
      });

      // Additional data ----------
      series.language = req.body.language;
      series.maturity = req.body.maturity;
      series.videoQuality = req.body.videoQuality;
      series.contentRating = req.body.contentRating;
      series.exclusive = req.body.exclusive;
      series.featured = req.body.featured;
      series.newReleased = req.body.newReleased;

      // SEO
      series.seoTitle = req.body.seoTitle;
      series.seoDescription = req.body.seoDescription;
      series.seoTags = req.body.seoTags;

      // geo blocking
      series.blockedCountries = req.body.blockedCountries;

      await series.save();

      res.status(200).json({
        status: true,
        message: "WebSeries data imported Successfully!",
        series,
      });

      //New release (series) related notification --- Commented for now
      // const userId = await User.find({
      //   "notification.NewReleasesMovie": true,
      // }).distinct("_id");

      // const userTokens = await User.find({
      //   "notification.NewReleasesMovie": true,
      // }).distinct("fcmToken");

      // if (userTokens.length !== 0) {
      //   const adminPromise = await admin;

      //   const payload = {
      //     tokens: userTokens,
      //     notification: {
      //       title: `New Release`,
      //       body: "Get Ready: Latest WebSeries Watchlist is Here!",
      //     },
      //   };

      //   try {
      //     const response = await adminPromise.messaging().send(payload);
      //     console.log("Successfully sent with response: ", response);

      //     await userId.map(async (id) => {
      //       const notification = new Notification();
      //       notification.title = series.title;
      //       notification.message = `Get Ready to Binge: New ${series.title} Added Today!`;
      //       notification.userId = id;
      //       notification.movieId = series._id;
      //       notification.image = series.image;
      //       notification.date = new Date().toLocaleString("en-US", {
      //         timeZone: "Asia/Kolkata",
      //       });
      //       await notification.save();
      //     });
      //   } catch (error) {
      //     console.log("Error sending message:      ", error);
      //   }
      // }
    } else if (req.query.type.toUpperCase() === "MOVIE") {
      // hlsFileName & hlsFileExt is required if videoType is 8
      if (
        req.body.videoType == 8 &&
        (!req.body.hlsFileName || !req.body.hlsFileExt)
      ) {
        return res
          .status(200)
          .json({ status: false, message: "Oops ! Invalid details!" });
      }

      const imageS3Url = await uploadTmdbImageToS3(
        imageUrl + result.backdrop_path,
        `KalingomovieImage`
      );
      const thumbnailS3Url = await uploadTmdbImageToS3(
        imageUrl + result.poster_path,
        `KalingomovieThumbnail`
      );

      const movie = new Movie();

      movie.videoType = req.body.videoType;
      movie.link = req.body.link;

      // Additional data ----------
      movie.language = req.body.language;
      movie.maturity = req.body.maturity;
      movie.videoQuality = req.body.videoQuality;
      movie.contentRating = req.body.contentRating;
      movie.exclusive = req.body.exclusive;
      movie.featured = req.body.featured;
      movie.newReleased = req.body.newReleased;

      // SEO
      movie.seoTitle = req.body.seoTitle;
      movie.seoDescription = req.body.seoDescription;
      movie.seoTags = req.body.seoTags;

      // geo blocking
      movie.blockedCountries = req.body.blockedCountries;

      // HLS
      if (req.body.videoType == 8) {
        movie.hlsFileName = req.body.hlsFileName;
        movie.wwprResourceId = createUniqueResourceId("wwpr");
        movie.fpResourceId = createUniqueResourceId("fp");

        const inputFile = `s3://${process.env.bucketName}/raw/${req.body.hlsFileName}.${req.body.hlsFileExt}`;
        const outputBucket = `s3://${process.env.bucketName}/transcoded`;
        const outputFolder = req.body.hlsFileName;

        // await createAndTriggerTranscodingJob(
        //   inputFile,
        //   outputBucket,
        //   outputFolder,
        //   movie.wwprResourceId,
        //   movie.fpResourceId
        // );
      }
      // -------------------------

      //genre for movie
      const genereArray = await result.genres.map(async (data) => {
        const genereId = await Genre.findOne({ uniqueId: data.id });
        return genereId?._id;
      });

      await Promise.all(genereArray).then(function (results) {
        movie.genre = results;
      });

      movie.genre = movie.genre.filter((e) => !!e);

      //region for movie
      const regionArray = await result.production_countries.map(
        async (data) => {
          const regionId = await Region.findOne({
            uniqueID: data.iso_3166_1,
          });
          return regionId._id;
        }
      );

      await Promise.all(regionArray).then(function (results) {
        movie.region = results[0];
      });

      //trailer for movie (https://api.themoviedb.org/3/movie/595/videos?api_key=67af5e631dcbb4d0981b06996fcd47bc&language=en-US)

      const trailerUrl = `https://api.themoviedb.org/3/movie/${req.query.TmdbMovieId}/videos?language=en-US`;

      const trailerResult = await fetch(trailerUrl, options).then((response) =>
        response.json()
      );

      await trailerResult.results.map(async (data) => {
        const trailerData = new Trailer();
        trailerData.name = data.name;
        trailerData.size = data.size;
        trailerData.type = data.type;
        trailerData.videoUrl = youtubeUrl + data.key;
        trailerData.key = data.key;
        trailerData.trailerImage = imageS3Url;
        trailerData.movie = movie._id;
        await trailerData.save();
      });

      //credit(cast) for movie (https://api.themoviedb.org/3/movie/595/credits?api_key=67af5e631dcbb4d0981b06996fcd47bc&language=en-US)

      const castUrl = `https://api.themoviedb.org/3/movie/${req.query.TmdbMovieId}/credits?language=en-US`;

      const castResult = await fetch(castUrl, options).then((response) =>
        response.json()
      );

      await castResult.cast.map(async (data) => {
        const castData = new Role();
        castData.name = data.name;
        castData.image = imageUrl + data.profile_path;
        castData.position = data.known_for_department;
        castData.movie = movie._id;
        await castData.save();
      });

      //for media_type movie find by IMDBid
      const IMDBidMediaType = await result.imdb_id;

      const mediaTypeUrl = `https://api.themoviedb.org/3/find/${IMDBidMediaType}?language=en&external_source=imdb_id`;

      const mediaTypeResult = await fetch(mediaTypeUrl, options).then(
        (response) => response.json()
      );

      movie.media_type = mediaTypeResult.movie_results[0].media_type;
      movie.title = result.title;
      movie.year = result.release_date;
      movie.runtime = result.runtime;
      movie.description = result.overview;
      movie.image = imageS3Url;
      movie.thumbnail = thumbnailS3Url;
      movie.TmdbMovieId = result.id;
      movie.IMDBid = result.imdb_id;
      movie.date = new Date().toLocaleString("en-US", {
        timeZone: "Asia/Kolkata",
      });
      await movie.save();

      res.status(200).json({
        status: true,
        message: "Movie data imported Successfully!",
        movie,
      });

      //New release (movie) related notification.....
      // const userId = await User.find({
      //   "notification.NewReleasesMovie": true,
      // }).distinct("_id");

      // const userTokens = await User.find({
      //   "notification.NewReleasesMovie": true,
      // }).distinct("fcmToken");

      // if (userTokens.length !== 0) {
      //   const adminPromise = await admin;

      //   // Send notifications to all users with valid tokens
      //   const sendPromises = userTokens.filter(token => token).map(async (token) => {
      //     const payload = {
      //       token: token,
      //       notification: {
      //         title: `New Release`,
      //         body: "Stay Tuned: New Movie Alert!",
      //       },
      //     };

      //     try {
      //       const response = await adminPromise.messaging().send(payload);
      //       console.log("Successfully sent notification to token:", token, "Response:", response);
      //       return { success: true, token, response };
      //     } catch (error) {
      //       console.log("Error sending notification to token:", token, "Error:", error);
      //       return { success: false, token, error };
      //     }
      //   });

      //   try {
      //     const results = await Promise.allSettled(sendPromises);
      //     console.log("Notification send results:", results);

      //     // Save notifications to database for all users
      //     await userId.map(async (id) => {
      //       const notification = new Notification();
      //       notification.title = movie.title;
      //       notification.message = `${movie.title} is Here! Don't Miss It!`;
      //       notification.userId = id;
      //       notification.movieId = movie._id;
      //       notification.image = movie.image;
      //       notification.date = new Date().toLocaleString("en-US", {
      //         timeZone: "Asia/Kolkata",
      //       });
      //       await notification.save();
      //     });
      //   } catch (error) {
      //     console.log("Error in notification process:", error);
      //   }
      // }
    } else {
      return res
        .status(200)
        .json({ status: false, message: "type must be passed valid." });
    }
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json({ status: false, error: error.message || "Internal Server error" });
  }
};

//get year for movie or series
exports.getYear = async (req, res) => {
  try {
    const movie = await Movie.find().select("year");

    return res.status(200).json({ status: true, message: "Success!", movie });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error!!",
    });
  }
};

//update movie or weSeries
exports.update = async (req, res) => {
  try {
    if (!req.query.movieId) {
      return res
        .status(200)
        .json({ status: false, message: "movieId must be requried." });
    }

    // if (!req.body.convertUpdateType || !req.body.updateType) {
    //   return res.status(200).json({
    //     status: false,
    //     message: "convertUpdateType and updateType must be requried.",
    //   });
    // }

    const movie = await Movie.findById(req.query.movieId);
    if (!movie) {
      return res
        .status(200)
        .json({ status: false, message: "No Movie Was Found." });
    }

    movie.title = req.body.title ? req.body.title : movie.title;
    movie.year = req.body.year ? req.body.year : movie.year;
    movie.region = req.body.region ? req.body.region : movie.region;
    movie.type = req.body.type ? req.body.type : movie.type;
    movie.videoType = req.body.videoType ? req.body.videoType : movie.videoType;
    movie.runtime = req.body.runtime ? req.body.runtime : movie.runtime;
    movie.description = req.body.description
      ? req.body.description
      : movie.description;

    const multipleGenre = req.body.genre
      ? req.body.genre.toString().split(",")
      : movie.genre;
    movie.genre = multipleGenre;

    if (req.body.genre) {
      const genreNames = await Genre.find({ _id: { $in: multipleGenre } }).distinct("name");
      movie.genres = genreNames;
    }

    const multipleTags = req.body.tags
      ? (Array.isArray(req.body.tags)
        ? req.body.tags
        : req.body.tags.toString().split(","))
      : movie.tags;
    movie.tags = multipleTags;

    movie.maturity = req.body.maturity ? req.body.maturity : movie.maturity;
    movie.videoQuality = req.body.videoQuality
      ? req.body.videoQuality
      : movie.videoQuality;
    movie.contentRating = req.body.contentRating
      ? req.body.contentRating
      : movie.contentRating;
    movie.exclusive = req.body.exclusive;
    movie.featured = req.body.featured;
    movie.newReleased = req.body.newReleased;
    movie.isCachedOnHome = req.body.isCachedOnHome;
    movie.language = req.body.language ? req.body.language : movie.language;
    movie.seoTitle = req.body.seoTitle ? req.body.seoTitle : movie.seoTitle;
    movie.seoDescription = req.body.seoDescription
      ? req.body.seoDescription
      : movie.seoDescription;
    movie.seoTags = req.body.seoTags ? req.body.seoTags : movie.seoTags;
    movie.blockedCountries = req.body.blockedCountries
      ? req.body.blockedCountries
      : movie.blockedCountries;
    movie.ads = req.body.ads;

    // Movie badges
    if (req.body.badges) {
      movie.badges = req.body.badges;
      movie.isCronBadge = false;
    }

    // Movie image
    if (req.body.image) {
      const urlParts = movie?.image.split("/");
      const keyName = urlParts?.pop(); //remove the last element
      const folderStructure = urlParts?.slice(3)?.join("/"); //Join elements starting from the 4th element

      await deleteFromAzure({ folderStructure, keyName });

      movie.updateType = Number(req.body.updateType); //always be 1
      // movie.convertUpdateType.image = Number(req.body.convertUpdateType.image); //always be 1
      movie.convertUpdateType.image = 1;
      movie.image = req.body.image;
    }

    // Movie landscapeImage
    if (req.body.landscapeImage) {
      if(movie.landscapeImage){

      const urlParts = movie?.landscapeImage?.split("/");
      const keyName = urlParts?.pop(); //remove the last element
      const folderStructure = urlParts?.slice(3)?.join("/"); //Join elements starting from the 4th element

      await deleteFromAzure({ folderStructure, keyName });
      }
      movie.updateType = Number(req.body.updateType); //always be 1
      // movie.convertUpdateType.landscapeImage = Number(req.body.convertUpdateType.landscapeImage); //always be 1
      movie.convertUpdateType.landscapeImage = 1;
      movie.landscapeImage = req.body.landscapeImage;
    }

    // Movie thumbnail
    if (req.body.thumbnail) {
      const urlParts = movie?.thumbnail.split("/");
      const keyName = urlParts?.pop(); //remove the last element
      const folderStructure = urlParts?.slice(3).join("/"); //Join elements starting from the 4th element

      await deleteFromAzure({ folderStructure, keyName });

      movie.updateType = Number(req.body.updateType); //always be 1
      // movie.convertUpdateType.thumbnail = Number(
      //   req.body.convertUpdateType.thumbnail
      // ); //always be 1
      movie.convertUpdateType.thumbnail = 1;
      movie.thumbnail = req.body.thumbnail;
    }

    // Movie video
    movie.link = req.body.link ? req.body.link : movie.link;
    if (req.body.link && req.body.videoType == 8) {
      const urlParts = movie?.link.split("/");
      const keyName = urlParts?.pop(); //remove the last element
      const folderStructure = urlParts?.slice(3).join("/"); //Join elements starting from the 4th element

      await deleteFromAzure({ folderStructure, keyName });

      movie.updateType = Number(req.body.updateType); //always be 1
      // movie.convertUpdateType.link = Number(req.body.convertUpdateType.link); //always be 1
      movie.convertUpdateType.link = 1;

      movie.link = req.body.link;
    }

    // Movie video hls

    if (req.body.videoType == 8 && req.body.hlsFileName) {
      if (movie.hlsFileName != req.body.hlsFileName) {
        // delete existing hls file
        // transcode new hls file
        movie.wwprResourceId = createUniqueResourceId("wwpr");
        movie.fpResourceId = createUniqueResourceId("fp");

        const inputFile = `s3://${process.env.bucketName}/raw/${req.body.hlsFileName}.${req.body.hlsFileExt}`;
        const outputBucket = `s3://${process.env.bucketName}/transcoded`;
        const outputFolder = req.body.hlsFileName;

        // await createAndTriggerTranscodingJob(
        //   inputFile,
        //   outputBucket,
        //   outputFolder,
        //   movie.wwprResourceId,
        //   movie.fpResourceId
        // );
      }
      movie.hlsFileName = req.body.hlsFileName;
    }

    await movie.save();

    const query = [
      { path: "region", select: "name" },
      { path: "genre", select: "name" },
      { path: "language", select: "name" },
    ];

    const data = await Movie.findById(movie._id).populate(query);

    return res.status(200).json({
      status: true,
      message: "Movie Updated Successfully.",
      movie: data,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

//add view to movie
exports.addView = async (req, res) => {
  try {
    if (!req.query.movieId) {
      return res
        .status(200)
        .json({ status: false, message: "Movie Id is required!!" });
    }

    const movie = await Movie.findById(req.query.movieId);
    if (!movie)
      return res
        .status(200)
        .json({ status: false, message: "No Movie Was Found!!" });

    movie.view += 1;
    await movie.save();

    return res
      .status(200)
      .json({ status: true, message: "View Added successfully!!", movie });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error!!",
    });
  }
};

//get all top10 through view for android
exports.getAllTop10 = async (req, res) => {
  const { type } = req.query;

  try {
    const matchQuery = {
      view: { $ne: 0 },
    };
    if (type) {
      if (type === "MOVIE") {
        matchQuery.media_type = "movie";
      }
      if (type === "WEB-SERIES") {
        matchQuery.media_type = "tv";
      }
    }

    // const list = await Movie.find(matchQuery).sort({ view: -1 }).limit(10);

    const list = await Movie.aggregate([
      ...blockCountryWise(req?.user?.country),
      {
        $match: matchQuery,
      },
      ...populateGenre,
      ...populateLanguage,
      ...populateRegion,
      ...populateSubtitle,
      ...populateTrailers,
      {
        $sort: {
          view: -1,
        },
      },
      {
        $limit: 10,
      },
    ]);

    return res.status(200).json({ status: true, message: "Success!", list });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

//get most viewed movies or webSeries for admin panel
exports.getAllCategoryTop10 = async (req, res) => {
  try {
    if (!req.query.type)
      return res
        .status(200)
        .json({ status: false, message: "Oops! Invalid details!" });

    var matchQuery;
    if (req.query.type === "WEB-SERIES") {
      matchQuery = { media_type: "tv" };
    } else if (req.query.type === "MOVIE") {
      matchQuery = { media_type: "movie" };
    } else {
      return res
        .status(200)
        .json({ status: false, message: "Pass Valid Type!!" });
    }

    const query = [
      { path: "region", select: ["name"] },
      { path: "genre", select: ["name"] },
    ];

    const movie = await Movie.find(matchQuery)
      .populate(query)
      .sort({ view: -1 })
      .limit(10);

    return res.status(200).json({ status: true, message: "Success!", movie });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error!!",
    });
  }
};

//newReleased switch
exports.isNewRelease = async (req, res) => {
  try {
    if (!req.query.movieId) {
      return res
        .status(200)
        .json({ status: false, message: "Movie Id is required !" });
    }

    const movie = await Movie.findById(req.query.movieId);
    if (!movie) {
      return res
        .status(200)
        .json({ status: false, message: "No Movie Was Found!!" });
    }

    movie.newReleased = !movie.newReleased;
    await movie.save();

    const data = await Movie.findById(movie._id).populate("region", "name");

    return res
      .status(200)
      .json({ status: true, message: "Success!", movie: data });
  } catch (error) {
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error!",
    });
  }
};

//get all newReleased
exports.getAllNewRelease = async (req, res) => {
  const { type } = req.query;

  try {
    const matchQuery = {
      newReleased: true,
    };
    if (type) {
      if (type === "MOVIE") {
        matchQuery.media_type = "movie";
      }
      if (type === "WEB-SERIES") {
        matchQuery.media_type = "tv";
      }
    }

    const list = await Movie.aggregate([
      ...blockCountryWise(req?.user?.country),
      {
        $match: matchQuery,
      },
      ...populateGenre,
      ...populateLanguage,
      ...populateRegion,
      ...populateSubtitle,
      ...populateTrailers,
      {
        $sort: {
          createdAt: -1,
        },
      },
      { $limit: 10 },
    ]);

    return res
      .status(200)
      .json({ status: true, message: "Success!", list, total: list.length });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error!",
    });
  }
};

//get movie(all category) wise trailer or episode for android
exports.MovieDetail = async (req, res) => {
  try {
    if (!req.params._id) {
      return res.status(200).json({ status: false, message: "Movie ID is required." });
    }

    let response;

    // Use cached data if available
    if (req.cachedData) {
      console.log('check cached data available')
      response = { ...req.cachedData };
    } else {
      // Fetch fresh data
      const movieId = new mongoose.Types.ObjectId(req.params._id);
      const movie = await Movie.findById(movieId);

      if (!movie) {
        return res.status(500).json({
          status: false,
          message: "No Movie or Web-Series Were Found.",
        });
      }

      const pipeline = [
        { $match: { _id: movie._id } },
        {
          $lookup: {
            from: "episodes",
            let: { movieId: movie._id },
            as: "episode",
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$$movieId", "$movie"] },
                      { $eq: ["$seasonNumber", 1] },
                      { $eq: ["$status", "PUBLISHED"] }
                    ],
                  },
                },
              },
              { $sort: { episodeNumber: 1 } },
              {
                $addFields: {
                  view: {
                    $add: [
                      { $multiply: ["$view", { $literal: global.settingJSON?.viewMultiplier || 1 }] },
                      { $literal: global.settingJSON?.viewConstant || 0 }
                    ]
                  },
                  favorite: {
                    $add: [
                      { $multiply: ["$favorite", { $literal: global.settingJSON?.favoriteMultiplier || 1 }] },
                      { $literal: global.settingJSON?.favoriteConstant || 0 }
                    ]
                  },
                  like: {
                    $add: [
                      { $multiply: ["$like", { $literal: global.settingJSON?.likeMultiplier || 1 }] },
                      { $literal: global.settingJSON?.likeConstant || 0 }
                    ]
                  }
                }
              },
              {
                $project: {
                  _id: 1, name: 1, episodeNumber: 1, seasonNumber: 1, hlsFileName: 1,
                  season: 1, TmdbMovieId: 1, videoType: 1, videoUrl: 1,
                  image: 1, drmEnabled: 1, favorite: 1, like: 1, view: 1, share: 1,
                }
              }
            ],
          },
        },
        {
          $lookup: {
            from: "seasons",
            let: { movieId: movie._id },
            as: "season",
            pipeline: [
              { $match: { $expr: { $eq: ["$$movieId", "$movie"] } } },
              { $sort: { seasonNumber: 1 } },
              { $project: { __v: 0, updatedAt: 0, createdAt: 0 } },
            ],
          },
        },
        {
          $project: {
            createdAt: 0, updatedAt: 0, __v: 0, thumbnail: 0, date: 0, runtime: 0
          },
        }
      ];

      const data = await Movie.aggregate(pipeline, { gamification: true });
      response = { status: true, message: "Success", movie: data };
    }

    // Handle firstEpisodeWatchDetails when episodeNo is provided
    if (req.query.episodeNo !== undefined && response.movie?.[0]?.media_type === "tv" && response.movie[0].episode?.length > 0) {
      const episodeNo = parseInt(req.query.episodeNo) || 0;
      const firstEpisode = response.movie[0].episode[episodeNo];

      if (firstEpisode?.hlsFileName) {
        try {
          const accessCheck = validateUserAccess(req.user);

          if (accessCheck?.isAllowed) {
            const cacheKey = `hls:${firstEpisode.hlsFileName}:${firstEpisode.drmEnabled ? 'drm' : 'nodrm'}`;

            let signedUrls = await getFromCache(cacheKey);

            if (!signedUrls) {
              signedUrls = await generateHlsSignedUrls(
                firstEpisode.hlsFileName,
                firstEpisode.drmEnabled || false
              );
              await setCache(cacheKey, signedUrls, process.env.REDIS_TTL);
            }

            response.firstEpisodeWatchDetails = signedUrls;
          } else {
            response.firstEpisodeWatchDetails = accessCheck;
          }
        } catch (signedUrlError) {
          console.error("Error generating signed URL:", signedUrlError);
        }
      }
    }

    return res.status(200).json(response);

  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

//get movie(all category) wise trailer or episode for admin
exports.MovieDetails = async (req, res) => {
  try {
    if (!req.query.movieId)
      return res
        .status(200)
        .json({ status: true, message: "Oops ! Invalid details!!" });

    const movie = await Movie.findById(req.query.movieId);
    if (!movie) {
      return res
        .status(500)
        .json({ status: false, message: "No Movie Was Found!!" });
    }

    await Movie.aggregate([
      {
        $match: { _id: movie._id },
      },
      {
        $lookup: {
          from: "episodes",
          let: {
            movieId: movie._id,
          },
          as: "episode",
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$$movieId", "$movie"] },
                    { $eq: ["$seasonNumber", 1] },
                  ],
                },
              },
            },
            { $sort: { episodeNumber: 1 } },
            { $project: { __v: 0, updatedAt: 0, createdAt: 0 } },
          ],
        },
      },
      {
        $lookup: {
          from: "trailers",
          let: {
            movieId: movie._id,
          },
          as: "trailer",
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$$movieId", "$movie"] },
              },
            },
            { $project: { __v: 0, updatedAt: 0, createdAt: 0 } },
          ],
        },
      },
      {
        $lookup: {
          from: "roles",
          let: {
            movieId: movie._id,
          },
          as: "role",
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$$movieId", "$movie"] },
              },
            },
            { $project: { __v: 0, updatedAt: 0, createdAt: 0 } },
          ],
        },
      },
      {
        $lookup: {
          from: "ratings",
          let: {
            movie: movie._id,
          },
          as: "rating",

          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$$movie", "$movieId"] },
              },
            },
            {
              $group: {
                _id: "$movieId",
                totalUser: { $sum: 1 }, //totalRating by user
                avgRating: { $avg: "$rating" },
              },
            },
          ],
        },
      },
      {
        $project: {
          createdAt: 0,
          updatedAt: 0,
          __v: 0,
          date: 0,
        },
      },
    ]).exec(async (error, data) => {
      if (error) console.log(error);
      else {
        const data_ = await Movie.populate(data, [
          { path: "region", select: "name" },
          { path: "genre", select: "name" },
          { path: "language", select: "name" },
        ]);

        return res
          .status(200)
          .json({ status: true, message: "Success!", movie: data_ });
      }
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error!!",
    });
  }
};

//searching in Movie
exports.search = async (req, res) => {
  try {
    const searchTerm = req.query.search;

    if (!searchTerm) {
      return res
        .status(200)
        .json({ status: true, message: "No data found.", movie: [] });
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const pipeline = [
      {
        $search: {
          index: "movie_search_index",
          compound: {
            should: [
              {
                wildcard: {
                  query: `*${searchTerm.toLowerCase().replace(/[*?\\]/g, '\\$&')}*`,
                  path: "title",
                  allowAnalyzedField: true,
                  score: { boost: { value: 12 } },
                },
              },
              {
                text: {
                  query: searchTerm,
                  path: "title",
                  fuzzy: { maxEdits: 1 },
                  score: { boost: { value: 10 } },
                },
              },
              {
                text: {
                  query: searchTerm,
                  path: "genres",
                  fuzzy: { maxEdits: 1 },
                  score: { boost: { value: 5 } },
                },
              },
              {
                text: {
                  query: searchTerm,
                  path: "description",
                  fuzzy: { maxEdits: 1 },
                  score: { boost: { value: 2 } },
                },
              },
            ],
          },
        },
      },
      {
        $addFields: {
          searchScore: { $meta: "searchScore" },
          // Formula: max(title_score, genre_score, description_score)
          // We scale the meta score which is already boosted by path weights above
          // fuzzy_match_score: { $multiply: [{ $meta: "searchScore" }, 5] },
          // views_boost: { $divide: [{ $ifNull: ["$view", 0] }, 10000] },
          // freshness_boost: {
          //   $cond: [{ $gt: ["$createdAt", thirtyDaysAgo] }, 10, 0],
          // },
        },
      },
      {
        $match: {
          searchScore: { $gte: 2 },
          status: CONTENT_STATUS.PUBLISHED,
        },
      },
      // {
      //   $addFields: {
      //     final_score: {
      //       $add: ["$fuzzy_match_score", "$views_boost", "$freshness_boost"],
      //     },
      //   },
      // },
      {
        $sort: { searchScore: -1, view: -1, publishedAt: -1, createdAt: -1 },
      },
      {
        $limit: 20,
      },
      {
        $project: {
          _id: 1,
          title: 1,
          image: 1,
          thumbnail: 1,
          description: 1,
          createdAt: 1,
          publishedAt: 1,
          media_type: 1,
          genres: 1,
          view: 1
        },
      },
    ];

    const response = await Movie.aggregate(pipeline);

    return res
      .status(200)
      .json({ status: true, message: "Success", movie: response });
  } catch (error) {
    console.error("Search Error:", error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

//get all movie for admin
exports.getAll = async (req, res) => {
  try {
    if (!req.query.type || !req.query.start || !req.query.limit)
      return res
        .status(200)
        .json({ status: false, message: "Oops! Invalid details." });

    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 10;

    var matchQuery;
    if (req.query.type === "WEBSERIES") {
      matchQuery = { media_type: "tv" };
    } else if (req.query.type === "MOVIE") {
      matchQuery = { media_type: "movie" };
    } else {
      return res
        .status(200)
        .json({ status: false, message: "Pass Valid Type!!" });
    }

    if (req.query.featured === true || req.query.featured === "true") {
      matchQuery.featured = true;
    }
    if (req.query.newReleased === true || req.query.newReleased === "true") {
      matchQuery.newReleased = true;
    }
    if (req.query.status) {
      matchQuery.status = req.query.status;
    }

    var searchQuery;
    searchQuery = {
      title: { $regex: req?.query?.search, $options: "i" },
    };

    const query = [
      { path: "region", select: ["name"] },
      { path: "genre", select: ["name"] },
      { path: "language", select: ["name"] },
    ];

    if (req.query.search) {
      const [totalMoviesWebSeries, movie] = await Promise.all([
        Movie.countDocuments({ ...matchQuery, ...searchQuery }),
        Movie.find({ ...matchQuery, ...searchQuery })
          .populate(query)
          .sort({ createdAt: -1 })
          .skip((start - 1) * limit)
          .limit(limit),
      ]);

      return res.status(200).json({
        status: true,
        message: "Success",
        totalMoviesWebSeries: totalMoviesWebSeries,
        movie: movie,
      });
    } else {
      const [totalMoviesWebSeries, movie] = await Promise.all([
        Movie.countDocuments(matchQuery),
        Movie.find(matchQuery)
          .populate(query)
          .sort({ createdAt: -1 })
          .skip((start - 1) * limit)
          .limit(limit),
      ]);

      return res.status(200).json({
        status: true,
        message: "Success",
        totalMoviesWebSeries: totalMoviesWebSeries,
        movie: movie,
      });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

//delete movie for admin
exports.destroy = async (req, res) => {
  try {
    const movie = await Movie.findById(
      mongoose.Types.ObjectId(req.query.movieId)
    );
    if (!movie) {
      return res
        .status(200)
        .json({ status: false, message: "No movie was found!!" });
    }

    if (movie.link) {
      //delete the old link from digitalOcean Spaces
      const urlParts = movie.link.split("/");
      const keyName = urlParts.pop(); //remove the last element
      const folderStructure = urlParts.slice(3).join("/"); //Join elements starting from the 4th element

      await deleteFromAzure({ folderStructure, keyName });
    }

    if (movie.image) {
      //delete the old image from digitalOcean Spaces
      const urlParts = movie.image.split("/");
      const keyName = urlParts.pop(); //remove the last element
      const folderStructure = urlParts.slice(3).join("/"); //Join elements starting from the 4th element

      await deleteFromAzure({ folderStructure, keyName });
    }

    if (movie.thumbnail) {
      //delete the old thumbnail from digitalOcean Spaces
      const urlParts = movie.thumbnail.split("/");
      const keyName = urlParts.pop(); //remove the last element
      const folderStructure = urlParts.slice(3).join("/"); //Join elements starting from the 4th element

      await deleteFromAzure({ folderStructure, keyName });
    }

    //delete season
    const season = await Season.find({ movie: movie._id });
    if (season.length > 0) {
      await season.map(async (seasonData) => {
        if (seasonData?.image) {
          //delete the old episodeImage from digitalOcean Spaces
          const urlParts = seasonData?.image.split("/");
          const keyName = urlParts.pop(); //remove the last element
          const folderStructure = urlParts.slice(3).join("/"); //Join elements starting from the 4th element

          await deleteFromAzure({ folderStructure, keyName });
        }

        await seasonData.deleteOne();
      });
    }

    //delete episode
    const episode = await Episode.find({ movie: movie._id });
    if (episode.length > 0) {
      await episode.map(async (episodeData) => {
        if (episodeData.videoUrl) {
          //delete the old episodeVideo from digitalOcean Spaces
          const urlParts = episodeData.videoUrl.split("/");
          const keyName = urlParts.pop(); //remove the last element
          const folderStructure = urlParts.slice(3).join("/"); //Join elements starting from the 4th element

          await deleteFromAzure({ folderStructure, keyName });
        }

        if (episodeData.image) {
          //delete the old episodeImage from digitalOcean Spaces
          const urlParts = episodeData.image.split("/");
          const keyName = urlParts.pop(); //remove the last element
          const folderStructure = urlParts.slice(3).join("/"); //Join elements starting from the 4th element

          await deleteFromAzure({ folderStructure, keyName });
        }

        await episodeData.deleteOne();
      });
    }

    //delete trailer
    const trailer = await Trailer.find({ movie: movie._id });
    if (trailer.length > 0) {
      await trailer.map(async (trailerData) => {
        if (trailerData.videoUrl) {
          //delete the old trailerVideourl from digitalOcean Spaces
          const urlParts = trailerData.videoUrl.split("/");
          const keyName = urlParts.pop(); //remove the last element
          const folderStructure = urlParts.slice(3).join("/"); //Join elements starting from the 4th element

          await deleteFromAzure({ folderStructure, keyName });
        }

        if (trailerData.trailerImage) {
          //delete the old trailerImage from digitalOcean Spaces
          const urlParts = trailerData.trailerImage.split("/");
          const keyName = urlParts.pop(); //remove the last element
          const folderStructure = urlParts.slice(3).join("/"); //Join elements starting from the 4th element

          await deleteFromAzure({ folderStructure, keyName });
        }

        await trailerData.deleteOne();
      });
    }

    //delete role
    const role = await Role.find({ movie: movie._id });
    if (role.length > 0) {
      await role.map(async (roleData) => {
        if (roleData.image) {
          //delete the old image from digitalOcean Spaces
          const urlParts = roleData.image.split("/");
          const keyName = urlParts.pop(); //remove the last element
          const folderStructure = urlParts.slice(3).join("/"); //Join elements starting from the 4th element

          await deleteFromAzure({ folderStructure, keyName });
        }

        await roleData.deleteOne();
      });
    }

    await movie.deleteOne();

    return res.status(200).json({
      status: true,
      message: "All Movie related data deleted Successfully!",
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error!",
    });
  }
};

//get all more like this movie
exports.getAllLikeThis = async (req, res) => {
  try {
    if (!req.query.movieId)
      return res
        .status(200)
        .json({ status: true, message: "Oops ! Invalid details." });

    const movieExist = await Movie.findById(req.query.movieId);
    if (!movieExist) {
      return res
        .status(200)
        .json({ status: false, message: "Movie does not found." });
    }

    // matching ---
    const matchQuery = {
      _id: { $ne: movieExist._id },
      media_type: { $eq: movieExist.media_type },
    };

    const list = await Movie.aggregate([
      ...blockCountryWise(req?.user?.country),
      { $match: matchQuery },
      ...populateGenre,
      ...populateLanguage,
      ...populateRegion,
      ...populateSubtitle,
      ...populateTrailers,
      {
        $limit: 10,
      },
    ]);

    return res.status(200).json({ status: true, message: "Success", list });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

//get all movie for android
exports.getMovie = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user)
      return res
        .status(200)
        .json({ status: false, message: "User does not found!!" });

    const planExist = await User.findOne(
      { _id: user._id },
      { isPremiumPlan: true }
    );

    await Movie.aggregate([
      { $addFields: { isPlan: planExist.isPremiumPlan ? true : false } },
      {
        $lookup: {
          from: "trailers",
          let: {
            movieId: "$_id",
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$$movieId", "$movie"] },
                    {
                      $or: [
                        { $eq: ["$type", "Trailer"] },
                        { $eq: ["$type", "Teaser"] },
                      ],
                    },
                  ],
                },
              },
            },
            { $project: { __v: 0, updatedAt: 0, createdAt: 0 } },
          ],
          as: "trailer",
        },
      },
      {
        $lookup: {
          from: "favorites",
          let: {
            movieId: "$_id",
            userId: user._id,
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$movieId", "$$movieId"] },
                    { $eq: ["$userId", user._id] },
                  ],
                },
              },
            },
          ],
          as: "isFavorite",
        },
      },
      {
        $project: {
          year: 1,
          newReleased: 1,
          image: 1,
          title: 1,
          description: 1,
          region: 1,
          genre: 1,
          type: 1,
          thumbnail: 1,
          TmdbMovieId: 1,
          IMDBid: 1,
          media_type: 1,
          isPlan: 1,
          isFavorite: {
            $cond: [{ $eq: [{ $size: "$isFavorite" }, 0] }, false, true],
          },
          trailer: 1,
        },
      },
    ]).exec(async (error, data) => {
      if (error) {
        console.log(error);
      } else {
        const data_ = await Movie.populate(data, [
          { path: "region", select: "name" },
          { path: "genre", select: "name" },
          { path: "language", select: "name" },
        ]);

        return res
          .status(200)
          .json({ status: true, message: "Success!", movie: data_ });
      }
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: true,
      error: error.message || "Internal Server Error!!",
    });
  }
};

//get all movie or webSeries filterWise
exports.MovieFilterWise = async (req, res) => {
  try {
    var regionArray = [];
    if (req?.body?.region) {
      const array = Array.isArray(req.body.region)
        ? req.body.region
        : [req.body.region];
      for (const region of array) {
        const elements = region.split(",");

        for (const element of elements) {
          regionArray.push(new mongoose.Types.ObjectId(element));
        }
      }
    }

    var genreArray = [];
    if (req?.body?.genre) {
      const array = Array.isArray(req.body.genre)
        ? req.body.genre
        : [req.body.genre];
      for (const genre of array) {
        const elements = genre.split(",");

        for (const element of elements) {
          genreArray.push(new mongoose.Types.ObjectId(element));
        }
      }
    }

    var yearArray = [];
    if (req?.body?.year) {
      const array = Array.isArray(req.body.year)
        ? req.body.year
        : [req.body.year];
      for (const year of array) {
        const elements = year.split(",");

        for (const element of elements) {
          yearArray.push(element);
        }
      }
    }

    var typeArray = [];
    if (req?.body?.media_type) {
      const array = Array.isArray(req.body.media_type)
        ? req.body.media_type
        : [req.body.media_type];
      for (const media_type of array) {
        const elements = media_type.split(",");

        for (const element of elements) {
          typeArray.push(element);
        }
      }
    }

    const movie = await Movie.aggregate([
      {
        $match: {
          $or: [
            { region: { $in: regionArray } },
            { genre: { $in: genreArray } },
            { year: { $in: yearArray } },
            { media_type: { $in: typeArray } },
          ],
          //media_type: { $in: typeArray },
        },
      },
      {
        $project: {
          _id: 1,
          year: 1,
          newReleased: 1,
          image: 1,
          thumbnail: 1,
          title: 1,
          media_type: 1,
          region: 1,
          genre: 1,
          TmdbMovieId: 1,
          IMDBid: 1,
        },
      },
    ]);

    return res.status(200).json({ status: true, message: "Success!", movie });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

//best ComedyMovie for android (home)
exports.bestComedyMovie = async (req, res) => {
  try {
    if (!req.query.type)
      return res
        .status(200)
        .json({ status: false, message: "Oops! Invalid details!!" });

    var matchQuery;
    if (req.query.type.toUpperCase() === "COMEDY") {
      matchQuery = { genre: "641c4c6e9620e83adb56676d", media_type: "movie" };
    }

    const movie = await Movie.find(matchQuery).sort({ view: -1 });

    return res
      .status(200)
      .json({ status: true, message: "Retrive best Comedy Movie!", movie });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

//get topRated movies or webseries for android
exports.getAllTopRated = async (req, res) => {
  const { type } = req.query;
  try {
    const matchQuery = {};
    if (type) {
      if (type === "MOVIE") {
        matchQuery.media_type = "movie";
      }
      if (type === "WEB-SERIES") {
        matchQuery.media_type = "tv";
      }
    }

    const list = await Movie.aggregate([
      ...blockCountryWise(req?.user?.country),
      { $match: matchQuery },
      ...populateGenre,
      ...populateLanguage,
      ...populateRegion,
      ...populateSubtitle,
      ...populateTrailers,
      {
        $lookup: {
          from: "ratings",
          localField: "_id",
          foreignField: "movieId",
          as: "movieRating",
        },
      },
      {
        $addFields: {
          // _id: 1,
          // title: 1,
          //ratingAverage: { $avg: "$movieRating.rating" },
          ratingAverage: {
            $cond: {
              if: { $eq: [{ $avg: "$movieRating.rating" }, null] },
              then: { $avg: 0 },
              else: { $avg: "$movieRating.rating" },
            },
          },
          // link: 1,
          // image: 1,
          // thumbnail: 1,
          // title: 1,
          // category: 1,
          // type: 1,
          // media_type: 1,
          // TmdbMovieId: 1,
          // IMDBid: 1,
        },
      },
      { $sort: { ratingAverage: -1 } },
      { $limit: 10 },
    ]);

    return res.status(200).json({ status: true, message: "Success!", list });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

//directly upload images from TMDb to your DigitalOcean Spaces
exports.getStoreFromTMDBToSpace = async (req, res) => {
  try {
    if (!req.query.TmdbMovieId || !req.query.type.toUpperCase()) {
      return res
        .status(200)
        .json({ status: false, message: "Oops ! Invalid details." });
    }

    async function uploadImageToS3(url, folderStructure, keyName) {
      const response = await axios.get(url, { responseType: "stream" });
      const params = {
        Bucket: process.env.bucketName,
        Key: `${folderStructure}/${keyName}`,
        Body: response.data,
        ACL: "public-read",
        ContentType: response.headers["content-type"],
      };
      return S3.upload(params).promise();
    }

    const tmdbApiKey = "67af5e631dcbb4d0981b06996fcd47bc";
    const imageUrlBase = "https://image.tmdb.org/t/p/original";

    await axios
      .get(
        `https://api.themoviedb.org/3/${req.query.type === "WEBSERIES" ? "tv" : "movie"
        }/${req.query.TmdbMovieId}?api_key=${tmdbApiKey}&language=en-US`
      )
      .then(async (result) => {
        const mediaType = req.query.type === "WEBSERIES" ? "tv" : "movie";
        const mediaData = result.data;
        const folderStructure = `mova/TMDB/${mediaType}`;

        const keyNameBackdrop = `backdrop_${mediaData.id}`;
        const keyNamePoster = `poster_${mediaData.id}`;

        const backdropUploadResult = await uploadImageToS3(
          `${imageUrlBase}${mediaData.backdrop_path}`,
          folderStructure,
          keyNameBackdrop
        );
        const backdropImageUrl = backdropUploadResult.Location;

        const posterUploadResult = await uploadImageToS3(
          `${imageUrlBase}${mediaData.poster_path}`,
          folderStructure,
          keyNamePoster
        );
        const posterImageUrl = posterUploadResult.Location;

        if (req.query.type === "WEBSERIES") {
          const series = new Movie();

          //genre for series
          const genereArray = await mediaData.genres.map(async (data) => {
            const genereId = await Genre.findOne({ uniqueId: data.id });
            return genereId?._id;
          });

          await Promise.all(genereArray).then(function (results) {
            series.genre = results;
          });

          series.genre = series.genre.filter((e) => !!e);

          //region for series
          const regionArray = await mediaData.production_countries.map(
            async (data) => {
              const regionId = await Region.findOne({
                uniqueID: data.iso_3166_1,
              });
              return regionId._id;
            }
          );

          await Promise.all(regionArray).then(function (results) {
            series.region = results[0];
          });

          await mediaData.seasons.map(async (data) => {
            const keyName = `seasonImage${data.poster_path}`;

            const seasonImageUploadResult = await uploadImageToS3(
              `${imageUrlBase}${data.poster_path}`,
              folderStructure,
              keyName
            );
            const seasonImageUrl = seasonImageUploadResult.Location;

            const season = new Season();
            season.name = data.name;
            season.seasonNumber = data.season_number;
            season.episodeCount = data.episode_count;
            season.image = seasonImageUrl;
            season.releaseDate = data.air_date;
            season.TmdbSeasonId = data.id;
            season.movie = series._id;
            await season.save();

            await axios
              .get(
                `https://api.themoviedb.org/3/tv/${req.query.TmdbMovieId
                }/season/
                   ${[
                  data.season_number,
                ]}?api_key=67af5e631dcbb4d0981b06996fcd47bc&language=en-US`
              )
              .then(async (resultEpisode) => {
                await resultEpisode.data.episodes.map(async (data) => {
                  const keyName = `episodeImage${data.still_path}`;

                  const episodeImageUploadResult = await uploadImageToS3(
                    `${imageUrlBase}${data.still_path}`,
                    folderStructure,
                    keyName
                  );
                  const episodeImageUrl = episodeImageUploadResult.Location;

                  const episode = new Episode();
                  episode.name = data.name;
                  episode.episodeNumber = data.episode_number;
                  episode.image = episodeImageUrl;
                  episode.seasonNumber = data.season_number;
                  episode.runtime = data.runtime;
                  episode.TmdbMovieId = data.show_id;
                  episode.movie = series._id;
                  episode.season = season._id;
                  await episode.save();
                });
              })
              .catch((error) => console.log(error));
          });

          //trailer for series API call
          await axios
            .get(
              `https://api.themoviedb.org/3/tv/${req.query.TmdbMovieId}/videos?api_key=67af5e631dcbb4d0981b06996fcd47bc&language=en-US`
            )
            .then(async (response) => {
              await response.data.results.map(async (data) => {
                const trailerData = new Trailer();
                trailerData.name = data.name;
                trailerData.size = data.size;
                trailerData.type = data.type;
                trailerData.videoUrl = youtubeUrl + data.key;
                trailerData.key = data.key;
                trailerData.trailerImage = backdropImageUrl;
                trailerData.movie = series._id;
                await trailerData.save();
              });
            })
            .catch((error) => console.log(error));

          //credit(cast) for series API call
          await axios
            .get(
              `https://api.themoviedb.org/3/tv/${req.query.TmdbMovieId}/aggregate_credits?api_key=67af5e631dcbb4d0981b06996fcd47bc&language=en-US`
            )
            .then(async (creditRes) => {
              await creditRes.data.cast.map(async (data) => {
                const keyName = `roleImage${data.profile_path}`;

                const roleImageUploadResult = await uploadImageToS3(
                  `${imageUrlBase}${data.profile_path}`,
                  folderStructure,
                  keyName
                );
                const roleImageUrl = roleImageUploadResult.Location;

                const castData = new Role();
                castData.name = data.name;
                castData.image = roleImageUrl;
                castData.position = data.known_for_department;
                castData.movie = series._id;
                await castData.save();
              });
            })
            .catch((error) => console.log(error));

          series.title = mediaData.name;
          series.year = mediaData.first_air_date;
          series.description = mediaData.overview;
          series.image = backdropImageUrl;
          series.thumbnail = posterImageUrl;
          series.TmdbMovieId = mediaData.id;
          series.media_type = "tv";
          series.date = new Date().toLocaleString("en-US", {
            timeZone: "Asia/Kolkata",
          });
          await series.save();

          res.status(200).json({
            status: true,
            message: "WebSeries data imported Successfully!",
            series,
          });
        } else if (req.query.type === "MOVIE") {
          const movie = new Movie();

          //genre for movie
          const genereArray = await result.data.genres.map(async (data) => {
            const genereId = await Genre.findOne({ uniqueId: data.id });
            return genereId?._id;
          });

          await Promise.all(genereArray).then(function (results) {
            movie.genre = results;
          });

          movie.genre = movie.genre.filter((e) => !!e);

          //region for movie
          const regionArray = await result.data.production_countries.map(
            async (data) => {
              const regionId = await Region.findOne({
                uniqueID: data.iso_3166_1,
              });
              return regionId._id;
            }
          );

          await Promise.all(regionArray).then(function (results) {
            movie.region = results[0];
          });

          //trailer for movie API call
          await axios
            .get(
              `https://api.themoviedb.org/3/movie/${req.query.TmdbMovieId}/videos?api_key=67af5e631dcbb4d0981b06996fcd47bc&language=en-US`
            )
            .then(async (response) => {
              await response.data.results.map(async (data) => {
                const trailerData = new Trailer();
                trailerData.name = data.name;
                trailerData.size = data.size;
                trailerData.type = data.type;
                trailerData.videoUrl = youtubeUrl + data.key;
                trailerData.key = data.key;
                trailerData.trailerImage = backdropImageUrl;
                trailerData.movie = movie._id;
                await trailerData.save();
              });
            })
            .catch((error) => console.log(error));

          //credit(cast) for movie API call
          await axios
            .get(
              `https://api.themoviedb.org/3/movie/${req.query.TmdbMovieId}/credits?api_key=67af5e631dcbb4d0981b06996fcd47bc&language=en-US`
            )
            .then(async (creditRes) => {
              await creditRes.data.cast.map(async (data) => {
                const keyName = `roleImage${data.profile_path}`;

                const roleImageUploadResult = await uploadImageToS3(
                  `${imageUrlBase}${data.profile_path}`,
                  folderStructure,
                  keyName
                );
                const roleImageUrl = roleImageUploadResult.Location;

                const castData = new Role();
                castData.name = data.name;
                castData.image = roleImageUrl;
                castData.position = data.known_for_department;
                castData.movie = movie._id;
                await castData.save();
              });
            })
            .catch((error) => console.log(error));

          //for media_type movie find by IMDBid API call
          const IMDBidMediaType = await result.data.imdb_id;

          await axios
            .get(
              `https://api.themoviedb.org/3/find/${IMDBidMediaType}?api_key=10471161c6c1b74f6278ff73bfe95982&language=en&external_source=imdb_id`
            )
            .then(async (result) => {
              movie.media_type = result.data.movie_results[0].media_type;
            })
            .catch((error) => console.log(error));

          movie.videoType = req.body.videoType;
          movie.link = req.body.link;
          movie.title = mediaData.title;
          movie.year = mediaData.release_date;
          movie.runtime = mediaData.runtime;
          movie.description = mediaData.overview;
          movie.image = backdropImageUrl;
          movie.thumbnail = posterImageUrl;
          movie.TmdbMovieId = mediaData.id;
          movie.IMDBid = mediaData.imdb_id;
          movie.date = new Date().toLocaleString("en-US", {
            timeZone: "Asia/Kolkata",
          });
          await movie.save();

          res.status(200).json({
            status: true,
            message: "Movie data imported Successfully!",
            movie,
          });
        } else {
          return res
            .status(200)
            .json({ status: false, message: "type must be passed valid." });
        }
      })
      .catch((error) => console.log(error));
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json({ status: false, error: error.message || "Internal Server error" });
  }
};

exports.hlsSignedUrl = async (req, res) => {
  let { hlsFileName, drm } = req.query;

  if (!hlsFileName) {
    return res
      .status(400)
      .json({ status: false, message: "Please provide directory name." });
  }

  try {
    // Get user details from auth middleware
    const user = req.user;
    const admin = req.admin
    console.log('admin', admin)

    if (admin?.role !== userRoles.ADMIN) {
      // Validate user access
      const accessCheck = validateUserAccess(user);
      if (!accessCheck.isAllowed) {
        return res.status(accessCheck.status || 403).json(accessCheck);
      }
    }

    // Determine if DRM is enabled
    const isDrmEnabled = drm === 'true' || false;

    // Generate signed URLs using helper function
    const signedUrls = await generateHlsSignedUrls(hlsFileName, isDrmEnabled);

    // Return the signed URLs
    res.status(200).json({
      status: true,
      ...signedUrls
    });

  } catch (error) {
    console.error("Error creating signed URL", error);
    res.status(500).json({
      status: false,
      message: "Internal server error.",
      error: error.message
    });
  }
};

exports.hlsSignedCookie = async (req, res) => {
  let { hlsFileName } = req.query;

  if (!hlsFileName) {
    res
      .status(400)
      .json({ status: false, message: "Please provide directory name." });
  }

  url = `${process.env.cloudfront_distribution}/transcoded/${hlsFileName}/`;

  try {
    const signedUrl = await cloudFrontSignedCookies(url);

    res.status(200).json({ status: true, data: signedUrl });
  } catch (error) {
    console.error("Error creating signed URL", error);
    res.status(500).json({ status: false, message: "Internal server error." });
  }
};

// get content by given filter
exports.getByFilter = async (req, res) => {
  const { mediaType, genre, page, perPage, sortBy, sortOrder, title, status } =
    req.query;

  // pagination ---
  const paginationQuery = {
    page: 1,
    perPage: 25,
  };
  if (perPage && !isNaN(perPage)) {
    paginationQuery.perPage = parseInt(perPage);
  }
  if (page && !isNaN(page)) {
    paginationQuery.page = parseInt(page);
  }
  const paginationPipe = [
    {
      $skip: (paginationQuery.page - 1) * paginationQuery.perPage,
    },
    {
      $limit: paginationQuery.perPage,
    },
  ];

  // sorting ---
  const sortQuery = {
    sortByField: "createdAt",
    sortOrderField: -1,
  };
  if (sortBy) {
    paginationQuery.sortByField = sortByField;
  }
  if (sortOrder && ["asc", "desc"].includes(sortOrder)) {
    paginationQuery.sortOrderField = sortOrder === "asc" ? 1 : -1;
  }
  const sortingPipe = [
    {
      $sort: {
        [sortQuery.sortByField]: sortQuery.sortOrderField,
      },
    },
  ];

  // matching ---
  const matchQuery = {};

  if (mediaType) {
    if (mediaType === "MOVIE") {
      matchQuery.media_type = "movie";
    }
    if (mediaType === "WEB-SERIES") {
      matchQuery.media_type = "tv";
    }
  }
  if (genre) {
    matchQuery.genre = { $in: [new mongoose.Types.ObjectId(genre)] };
  }
  if (title) {
    matchQuery.title = { $regex: title, $options: "i" };
  }
  if (status) {
    matchQuery.status = status;
  }

  try {
    const list = await Movie.aggregate([
      ...blockCountryWise(req?.user?.country),
      { $match: matchQuery },
      ...populateGenre,
      ...populateLanguage,
      ...populateRegion,
      ...populateSubtitle,
      ...populateTrailers,
      ...sortingPipe,
      ...paginationPipe,
    ]);

    let total = await Movie.aggregate([{ $match: matchQuery }]);
    total = total.length;

    return res.status(200).json({
      status: true,
      message: "Success!",
      list,
      total,
      page: paginationQuery.page,
      perPage: paginationQuery.perPage,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

//get all featured
exports.getFeatured = async (req, res) => {
  const { type } = req.query;

  try {
    const matchQuery = {
      featured: true,
    };
    if (type) {
      if (type === "MOVIE") {
        matchQuery.media_type = "movie";
      }
      if (type === "WEB-SERIES") {
        matchQuery.media_type = "tv";
      }
    }

    const list = await Movie.aggregate([
      ...blockCountryWise(req?.user?.country),
      {
        $match: matchQuery,
      },
      ...populateGenre,
      ...populateLanguage,
      ...populateRegion,
      ...populateSubtitle,
      ...populateTrailers,
      {
        $sort: {
          createdAt: -1,
        },
      },
      { $limit: 10 },
    ]);

    return res
      .status(200)
      .json({ status: true, message: "Success!", list, total: list.length });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error!",
    });
  }
};

// list of Ids movie
exports.getIdList = async (req, res) => {
  const { type } = req.query;

  try {
    const matchQuery = {};
    if (type) {
      if (type === "MOVIE") {
        matchQuery.media_type = "movie";
      }
      if (type === "WEB-SERIES") {
        matchQuery.media_type = "tv";
      }
    }

    const list = await Movie.aggregate([
      {
        $match: matchQuery,
      },
      {
        $project: {
          title: 1,
          _id: 1,
        },
      },
      {
        $sort: {
          createdAt: -1,
        },
      },
      { $limit: 10 },
    ]);

    return res
      .status(200)
      .json({ status: true, message: "Success!", list, total: list.length });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error!",
    });
  }
};

// Update movie status
exports.updateStatus = async (req, res) => {
  try {
    const { movieId } = req.query;
    const { status } = req.body;

    if (!movieId) {
      return res.status(400).json({
        status: false,
        message: "Movie ID is required",
      });
    }

    if (!status || !["DRAFT", "PUBLISHED", "ARCHIVED"].includes(status)) {
      return res.status(400).json({
        status: false,
        message: "Invalid status. Must be one of: DRAFT, PUBLISHED, ARCHIVED",
      });
    }

    const movie = await Movie.findById(movieId);
    if (!movie) {
      return res.status(404).json({
        status: false,
        message: "Movie not found",
      });
    }

    const updateData = { status };

    if (status === "PUBLISHED") {
      const now = new Date().toISOString();
      if (!movie.publishedAt) {
        updateData.publishedAt = now;
      }
      updateData.lastPublishedAt = now;
    }

    const updatedMovie = await Movie.findByIdAndUpdate(
      movieId,
      updateData,
      { new: true }
    ).populate("region genre language blockedCountries");

    return res.status(200).json({
      status: true,
      message: "Status updated successfully",
      movie: updatedMovie,
    });
  } catch (error) {
    console.error("Error updating movie status:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

// Batch process multiple HLS files
// Get user-specific details for movies/episodes (favorite, like status)
exports.getUserContentStatus = async (req, res) => {
  try {
    const { items = [] } = req.body;
    const user = req.user;

    if (!user?.userId || user.loginType === 3) {
      return res.status(200).json({ status: true, data: [] });
    }

    const userObjectId = new mongoose.Types.ObjectId(user.userId);
    const allEpisodeIds = items.map(item => new mongoose.Types.ObjectId(item.episodeId));

    const [episodeFavorites, episodeLikes, episodes] = await Promise.all([
      Favorite.find({ userId: userObjectId, episodeId: { $in: allEpisodeIds }, type: 'tv' }).lean(),
      Like.find({ userId: userObjectId, episodeId: { $in: allEpisodeIds }, type: 'tv' }).lean(),
      Episode.find({ _id: { $in: allEpisodeIds } }).select('favorite like').lean()
    ]);

    const favoriteMultiplier = global.settingJSON?.favoriteMultiplier || 1;
    const favoriteConstant = global.settingJSON?.favoriteConstant || 0;
    const likeMultiplier = global.settingJSON?.likeMultiplier || 1;
    const likeConstant = global.settingJSON?.likeConstant || 0;

    const episodeMap = {};
    episodes.forEach(episode => {
      episodeMap[episode._id.toString()] = {
        favoriteCount: Math.round((favoriteMultiplier * (episode.favorite || 0)) + favoriteConstant),
        likeCount: Math.round((likeMultiplier * (episode.like || 0)) + likeConstant)
      };
    });

    const result = items.map(item => ({
      movieId: item.movieId,
      episodeId: item.episodeId,
      isFavorite: episodeFavorites.some(fav => fav.episodeId?.toString() === item.episodeId),
      isLike: episodeLikes.some(like => like.episodeId?.toString() === item.episodeId),
      favoriteCount: episodeMap[item.episodeId]?.favoriteCount || 0,
      likeCount: episodeMap[item.episodeId]?.likeCount || 0
    }));

    return res.status(200).json({ status: true, data: result });
  } catch (error) {
    console.error('Error fetching user content status:', error);
    return res.status(500).json({ status: false, message: error.message });
  }
};

exports.batchHlsSignedUrl = async (req, res) => {
  const { hlsFiles } = req.body;

  if (!hlsFiles || !Array.isArray(hlsFiles) || hlsFiles.length === 0) {
    return res.status(400).json({
      status: false,
      message: "Please provide an array of HLS file objects with hlsFileName and drm properties."
    });
  }

  try {
    const user = req.user;
    const accessCheck = validateUserAccess(user);
    if (!accessCheck.isAllowed) {
      return res.status(accessCheck.status || 403).json(accessCheck);
    }

    // Get episode IDs and prepare for status checking
    const episodeIds = hlsFiles.filter(file => file.episodeId).map(file => file.episodeId);
    let episodeStatusMap = {};

    // Fetch episode status for non-guest users
    if (user.loginType !== 3 && user.userId && episodeIds.length > 0) {
      const userObjectId = new mongoose.Types.ObjectId(user.userId);
      const episodeObjectIds = episodeIds.map(id => new mongoose.Types.ObjectId(id));

      const [favorites, likes] = await Promise.all([
        Favorite.find({ userId: userObjectId, episodeId: { $in: episodeObjectIds } }).distinct('episodeId'),
        Like.find({ userId: userObjectId, episodeId: { $in: episodeObjectIds } }).distinct('episodeId')
      ]);

      episodeIds.forEach(episodeId => {
        episodeStatusMap[episodeId] = {
          isFavorite: favorites.some(fav => fav.toString() === episodeId),
          isLike: likes.some(like => like.toString() === episodeId)
        };
      });
    }

    const processHlsFile = async (file) => {
      const { hlsFileName, drm, episodeId, hasExpiredLastRequest } = file;

      if (!hlsFileName) {
        return {
          hlsFileName: hlsFileName || 'unknown',
          error: "Missing hlsFileName"
        };
      }

      try {
        // Check cache first
        const cacheKey = `hls:${hlsFileName}:${drm ? 'drm' : 'nodrm'}`;
        const cachedUrls = await getFromCache(cacheKey);

        let result;
        //skip cache if hasExpiredLastRequest is true
        if (cachedUrls && !hasExpiredLastRequest) {
          result = { ...cachedUrls };
        } else {
          // Generate fresh signed URLs
          const signedUrls = await generateHlsSignedUrls(hlsFileName, drm === true || false);
          await setCache(cacheKey, signedUrls, process.env.REDIS_TTL);
          result = signedUrls;
        }

        // Add episode status if available
        if (episodeId && episodeStatusMap[episodeId]) {
          result.isFavorite = episodeStatusMap[episodeId].isFavorite;
          result.isLike = episodeStatusMap[episodeId].isLike;
        }

        return result;
      } catch (fileError) {
        console.error(`Error processing ${hlsFileName}:`, fileError);
        return { hlsFileName, error: fileError.message };
      }
    };

    const results = await Promise.all(hlsFiles.map(processHlsFile));

    res.status(200).json({ status: true, data: results });

  } catch (error) {
    console.error("Error creating batch signed URLs", error);
    res.status(500).json({
      status: false,
      message: "Internal server error.",
      error: error.message
    });
  }
};

// Helper function to validate user access and check limits
const validateUserAccess = (user) => {
  // Check if premium plan is actually expired
  if (user.isPremiumPlan && user.plan && user.plan.planEndDate) {
    const currentTime = new Date();
    const planEndDate = new Date(user.plan.planEndDate);

    if (currentTime > planEndDate) {
      // Plan has expired, treat as non-premium user
      return {
        isAllowed: false,
        status: 403,
        message: "Your premium plan has expired. Please renew your subscription to continue watching.",
        code: "PREMIUM_PLAN_EXPIRED",
        planEndDate: user.plan.planEndDate
      };
    }
  }

  // If user is premium (and not expired), allow access
  if (user.isPremiumPlan) {
    return { isAllowed: true };
  }

  // For non-premium users, check episode limits
  const settings = global.settingJSON;
  const maxEpisodeLimit = settings?.anonymousEpisodeWatchLimit || 5;

  // For logged-in users with active free trial
  if (user.userId && user.freeTrial && user.freeTrial.isActive) {
    const watchedEpisodes = user.freeTrial.watchedCount || 0;

    if (watchedEpisodes >= maxEpisodeLimit) {
      return {
        isAllowed: false,
        status: 403,
        message: "Free trial episode limit reached. Please upgrade to premium to continue watching.",
        code: "FREE_TRIAL_LIMIT_EXCEEDED",
        watchedEpisodes,
        maxEpisodeLimit
      };
    }
  }
  // For anonymous users (including guest users)
  else if (user.deviceId && user.role === 'ANONYMOUS') {
    const watchedEpisodes = user.freeTrial?.watchedCount || 0;

    // For guest users with active free trial
    if (user.freeTrial && user.freeTrial.isActive) {
      if (watchedEpisodes >= maxEpisodeLimit) {
        return {
          isAllowed: false,
          status: 403,
          message: "Free trial episode limit reached. Please upgrade to premium to continue watching.",
          code: "FREE_TRIAL_LIMIT_EXCEEDED",
          watchedEpisodes,
          maxEpisodeLimit
        };
      }
    }
    // For anonymous users without free trial
    else if (watchedEpisodes >= maxEpisodeLimit) {
      return {
        isAllowed: false,
        status: 403,
        message: "Anonymous episode limit reached. Please login or start a free trial to continue watching.",
        code: "ANONYMOUS_LIMIT_EXCEEDED",
        watchedEpisodes,
        maxEpisodeLimit,
        canStartFreeTrial: settings?.isFreeTrialEnabled || false
      };
    }
  }
  // Unknown user type
  else {
    // console.log('Unable to determine user access level. Please login or contact support.', user)
    return {
      isAllowed: false,
      status: 403,
      message: "Unable to determine user access level. Please login or contact support.",
      code: "UNKNOWN_USER_TYPE"
    };
  }

  // If we get here, the user is allowed
  return { isAllowed: true };
};

// Helper function to generate signed URLs for HLS content
const generateHlsSignedUrls = async (hlsFileName, isDrmEnabled, expiry = process.env.MUX_TOKEN_EXPIRE) => {
  try {
    // Choose the appropriate client based on DRM status
    const client = isDrmEnabled ? muxDrmClient : muxClient;

    // Base options for JWT signing
    const baseOptions = {
      keyId: isDrmEnabled ? process.env.MUX_DRM_SIGNING_KEY_ID : process.env.MUX_SIGNING_KEY_ID,
      keySecret: isDrmEnabled ? process.env.MUX_DRM_SIGNING_KEY_SECRET : process.env.MUX_SIGNING_KEY_SECRET,
      expiration: expiry, // Token valid for 60 minutes
    };

    // Generate tokens in parallel
    const [videoToken, videoToken480p, thumbnailToken, drmLicenseToken] = await Promise.all([
      client.jwt.signPlaybackId(hlsFileName, {
        ...baseOptions,
        type: 'video',
        params: { max_resolution: '720p' }
      }),
      // 480p limited video token
      client.jwt.signPlaybackId(hlsFileName, {
        ...baseOptions,
        type: 'video',
        params: { max_resolution: '480p' }  // Limit to 480p
      }),
      client.jwt.signPlaybackId(hlsFileName, {
        ...baseOptions,
        type: 'thumbnail',
        params: { time: 0 }
      }),
      // Only generate DRM token if needed
      isDrmEnabled ?
        client.jwt.signDrmLicense(hlsFileName, { ...baseOptions }).catch(err => {
          console.error(`Error generating DRM license token for ${hlsFileName}:`, err);
          return null;
        }) :
        Promise.resolve(null)
    ]);

    // Construct signed URLs
    const videoUrl = `https://stream.mux.com/${hlsFileName}.m3u8?token=${videoToken}`;
    const videoUrl480p = `https://stream.mux.com/${hlsFileName}.m3u8?token=${videoToken480p}`;
    const thumbnailUrl = `https://image.mux.com/${hlsFileName}/thumbnail.png?token=${thumbnailToken}`;

    return {
      signature: videoToken,
      drmLicenseToken,
      signedThumbnailUrl: thumbnailUrl,
      signedVideoUrl: videoUrl,
      signedVideoUrl480p: videoUrl480p,
      hlsFileName,
      drm: isDrmEnabled
    };
  } catch (error) {
    console.error(`Error generating signed URLs for ${hlsFileName}:`, error);
    throw error;
  }
};

// get GAM ad config for users
exports.getGamConfig = async (req, res) => {
  try {
    const { movieId } = req.query;

    const setting = await Setting.findOne(
      {},
      { movieAd: 1, forYouAd: 1, _id: 0 }
    ).lean();

    let adConfig;

    if (movieId) {
      const movie = await Movie.findById(movieId)
        .select("ads")
        .lean();

      if (!movie) {
        return res.status(404).json({
          status: false,
          message: "Movie not found",
        });
      }

      adConfig = {
        adEnabled: typeof movie.ads?.adEnabled === 'boolean' ? movie.ads?.adEnabled : setting.movieAd?.adEnabled,
        firstAdAfterEpisodes: movie.ads?.firstAdAfterEpisodes || setting.movieAd?.firstAdAfterEpisodes,
        subsequentAdInterval: movie.ads?.subsequentAdInterval || setting.movieAd?.subsequentAdInterval
      }
    } else {
      // else case for "FOR YOU" ads config
      adConfig = setting.forYouAd;
    }

    return res.status(200).json({
      status: true,
      data: adConfig,
    });

  } catch (error) {
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};


exports.generateHlsSignedUrls = generateHlsSignedUrls;
