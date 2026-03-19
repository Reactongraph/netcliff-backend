const Season = require("./season.model");

//import model
const Movie = require("../movie/movie.model");

//deleteFromS3
const { deleteFromS3 } = require("../../util/deleteFromS3");

//create season
exports.store = async (req, res) => {
  try {
    if (
      !req.body ||
      !req.body.name ||
      !req.body.seasonNumber ||
      !req.body.movieId
    ) {
      return res.status(200).json({ status: false, message: "Name, season number, and movie ID are required!" });
    }

    const movie = await Movie.findById(req.body.movieId);
    if (!movie) return res.status(200).json({ status: false, message: "Movie does not found!!" });

    const season = new Season();

    season.image = req.body.image || "";
    season.name = req.body.name;
    season.seasonNumber = req.body.seasonNumber;
    season.episodeCount = req.body.episodeCount || "";
    season.releaseDate = req.body.releaseDate || "";
    season.movie = movie._id;
    season.updateType = req.body.updateType || 1;
    await season.save();

    const data = await Season.findById(season._id).populate("movie", "title");

    return res.status(200).json({
      status: true,
      message: "Season created by admin.",
      season: data,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error",
    });
  }
};

//update season
exports.update = async (req, res) => {
  try {
    if (!req.query.seasonId) {
      return res.status(200).json({ status: false, message: "seasonId must be requried." });
    }

    const season = await Season.findById(req.query.seasonId);
    if (!season) {
      return res.status(200).json({ status: false, message: "Season does not found." });
    }

    season.name = req.body.name ? req.body.name : season.name;
    season.seasonNumber = req.body.seasonNumber ? req.body.seasonNumber : season.seasonNumber;
    season.episodeCount = req.body.episodeCount ? req.body.episodeCount : season.episodeCount;
    season.releaseDate = req.body.releaseDate ? req.body.releaseDate : season.releaseDate;
    season.TmdbSeasonId = req.body.TmdbSeasonId ? req.body.TmdbSeasonId : season.TmdbSeasonId;
    season.movie = req.body.movie ? req.body.movie : season.movie;

    if (req.body.image) {
      const urlParts = season.image.split("/");
      const keyName = urlParts.pop(); //remove the last element
      const folderStructure = urlParts.slice(3).join("/"); //Join elements starting from the 4th element

      await deleteFromS3({ folderStructure, keyName });

      season.updateType = 1;
      season.image = req.body.image ? req.body.image : season.image;
    }

    await season.save();

    const data = await Season.findById(season._id).populate("movie", "title");

    return res.status(200).json({ status: true, message: "Season has been update by admin.", season: data });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

//delete season
exports.destroy = async (req, res) => {
  try {
    if (!req.query.seasonId) {
      return res.status(200).json({ status: false, message: "SeasonId is required!!" });
    }

    const season = await Season.findById(req.query.seasonId);
    if (!season) {
      return res.status(200).json({ status: false, message: "Season does not found!!" });
    }

    //delete the old image from digitalOcean Spaces
    if (season.image) {
      const urlParts = season.image.split("/");
      const keyName = urlParts.pop(); //remove the last element
      const folderStructure = urlParts.slice(3).join("/"); //Join elements starting from the 4th element

      await deleteFromS3({ folderStructure, keyName });
    }

    await season.deleteOne();

    return res.status(200).json({ status: true, message: "Season is deleted by admin." });
  } catch (error) {
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

//get all season
exports.get = async (req, res) => {
  try {
    const season = await Season.find().populate("movie", "title media_type").sort({ createdAt: -1 });

    return res.status(200).json({ status: true, message: "Success", season });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error",
    });
  }
};

//get season particular movieId wise
exports.getIdWise = async (req, res) => {
  try {
    if (!req.query.movieId) return res.status(200).json({ status: true, message: "Oops ! Invalid details!!" });

    const movie = await Movie.findById(req.query.movieId);
    if (!movie) {
      return res.status(500).json({ status: false, message: "No Movie Was Found!!" });
    }

    const season = await Season.find({ movie: movie._id }).populate("movie", "title").sort({ seasonNumber: 1 });

    return res.status(200).json({ status: true, message: "Success", season });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error",
    });
  }
};
