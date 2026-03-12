const Trailer = require("./trailer.model");

//mongoose
const mongoose = require("mongoose");

//import model
const Movie = require("../movie/movie.model");

//deleteFromAzure
const { deleteFromAzure } = require("../../util/deleteFromAzure");

//create trailer
exports.store = async (req, res) => {
  try {
    console.log("body-------", req.body);

    if (!req.body.name || !req.body.movie || !req.body.type || !req.body.videoType || !req.body.videoUrl || !req.body.trailerImage) {
      return res.status(200).json({ status: false, message: "Oops ! Invalid details." });
    }

    const movie = await Movie.findById(req.body.movie);
    if (!movie) {
      return res.status(200).json({ status: false, message: "Movie does not found!!" });
    }

    const trailer = new Trailer();

    trailer.trailerImage = req.body.trailerImage;
    trailer.videoUrl = req.body.videoUrl;
    trailer.name = req.body.name;
    trailer.videoType = req.body.videoType;
    trailer.type = req.body.type;
    trailer.movie = movie._id;

    trailer.updateType = 1;
    trailer.convertUpdateType.trailerImage = 1;
    trailer.convertUpdateType.videoUrl = 1;
    await trailer.save();

    const data = await Trailer.aggregate([
      {
        $match: { _id: trailer._id },
      },
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: "movies",
          localField: "movie",
          foreignField: "_id",
          as: "movie",
        },
      },
      {
        $unwind: {
          path: "$movie",
          preserveNullAndEmptyArrays: false,
        },
      },
      {
        $project: {
          name: 1,
          videoType: 1,
          videoUrl: 1,
          trailerImage: 1,
          type: 1,
          createdAt: 1,
          convertUpdateType: 1,
          updateType: 1,
          movieTitle: "$movie.title",
          movieId: "$movie._id",
        },
      },
    ]);

    return res.status(200).json({
      status: true,
      message: "Trailer Added Successfully.",
      trailer: data[0],
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

//update trailer
exports.update = async (req, res) => {
  try {
    console.log("update trailer body", req.body);

    if (!req.body.convertUpdateType || !req.body.updateType) {
      return res.status(200).json({ status: false, message: "convertUpdateType and updateType must be requried." });
    }

    const trailer = await Trailer.findById(req.query.trailerId);
    if (!trailer) {
      return res.status(200).json({ status: false, message: "Trailer does not found." });
    }

    trailer.name = req.body.name ? req.body.name : trailer.name;
    trailer.type = req.body.type ? req.body.type : trailer.type;
    trailer.movie = req.body.movie ? req.body.movie : trailer.movie;
    trailer.videoType = req.body.videoType ? req.body.videoType : trailer.videoType;

    if (req.body.trailerImage) {
      //delete the trailerImage from digitalOcean Spaces
      const urlParts = trailer.trailerImage.split("/");
      const keyName = urlParts.pop(); //remove the last element
      const folderStructure = urlParts.slice(3).join("/"); //Join elements starting from the 4th element

      await deleteFromAzure({ folderStructure, keyName });

      trailer.updateType = Number(req.body.updateType); //always be 1
      trailer.convertUpdateType.trailerImage = Number(req.body.convertUpdateType.trailerImage); //always be 1
      trailer.trailerImage = req.body.trailerImage ? req.body.trailerImage : trailer.trailerImage;
    }

    if (req.body.videoUrl) {
      //delete the trailerVideo from digitalOcean Spaces
      const urlParts = trailer.videoUrl.split("/");
      const keyName = urlParts.pop(); //remove the last element
      const folderStructure = urlParts.slice(3).join("/"); //Join elements starting from the 4th element

      await deleteFromAzure({ folderStructure, keyName });

      trailer.updateType = Number(req.body.updateType); //always be 1
      trailer.convertUpdateType.videoUrl = Number(req.body.convertUpdateType.videoUrl); //always be 1
      trailer.videoUrl = req.body.videoUrl ? req.body.videoUrl : trailer.videoUrl;
    }

    await trailer.save();

    const data = await Trailer.aggregate([
      {
        $match: { _id: trailer._id },
      },
      {
        $lookup: {
          from: "movies",
          localField: "movie",
          foreignField: "_id",
          as: "movie",
        },
      },
      {
        $unwind: {
          path: "$movie",
          preserveNullAndEmptyArrays: false,
        },
      },
      {
        $project: {
          name: 1,
          videoType: 1,
          videoUrl: 1,
          trailerImage: 1,
          type: 1,
          convertUpdateType: 1,
          updateType: 1,
          movieTitle: "$movie.title",
          movieId: "$movie._id",
        },
      },
    ]);

    return res.status(200).json({
      status: true,
      message: "Trailer Updated Successfully.",
      trailer: data[0],
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

//delete trailer
exports.destroy = async (req, res) => {
  try {
    const trailer = await Trailer.findById(mongoose.Types.ObjectId(req.query.trailerId));
    if (!trailer) {
      return res.status(200).json({ status: false, message: "Trailer does not found." });
    }

    if (trailer.trailerImage) {
      //delete the trailerImage from digitalOcean Spaces
      const urlParts = trailer.trailerImage.split("/");
      const keyName = urlParts.pop(); //remove the last element
      const folderStructure = urlParts.slice(3).join("/"); //Join elements starting from the 4th element

      await deleteFromAzure({ folderStructure, keyName });
    }

    if (trailer.videoUrl) {
      //delete the trailerVideo from digitalOcean Spaces
      const urlParts = trailer.videoUrl.split("/");
      const keyName = urlParts.pop(); //remove the last element
      const folderStructure = urlParts.slice(3).join("/"); //Join elements starting from the 4th element

      await deleteFromAzure({ folderStructure, keyName });
    }

    await trailer.deleteOne();

    return res.status(200).json({ status: true, message: "Trailer deleted by admin." });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

//get all trailer
exports.get = async (req, res) => {
  try {
    const trailer = await Trailer.aggregate([
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: "movies",
          localField: "movie",
          foreignField: "_id",
          as: "movie",
        },
      },
      {
        $unwind: {
          path: "$movie",
          preserveNullAndEmptyArrays: false,
        },
      },
      {
        $project: {
          name: 1,
          videoType: 1,
          videoUrl: 1,
          trailerImage: 1,
          type: 1,
          size: 1,
          createdAt: 1,
          convertUpdateType: 1,
          updateType: 1,
          movieTitle: "$movie.title",
          movieId: "$movie._id",
          TmdbMovieId: "$movie.TmdbMovieId",
          IMDBid: "$movie.IMDBid",
        },
      },
    ]);

    return res.status(200).json({ status: true, message: "Success", trailer });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

//get trailer movieId wise for admin
exports.getIdWise = async (req, res) => {
  try {
    if (!req.query.movieId) {
      return res.status(200).json({ status: true, message: "movieId must be requried!" });
    }

    const movie = await Movie.findById(req.query.movieId);
    if (!movie) {
      return res.status(500).json({ status: false, message: "No Movie Was Found." });
    }

    const trailer = await Trailer.aggregate([
      {
        $match: {
          movie: movie._id,
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: "movies",
          localField: "movie",
          foreignField: "_id",
          as: "movie",
        },
      },
      {
        $unwind: {
          path: "$movie",
          preserveNullAndEmptyArrays: false,
        },
      },
      {
        $project: {
          name: 1,
          videoType: 1,
          videoUrl: 1,
          trailerImage: 1,
          type: 1,
          size: 1,
          createdAt: 1,
          updateType: 1,
          convertUpdateType: 1,
          movieTitle: "$movie.title",
          movieId: "$movie._id",
          movieType: "$movie.media_type",
          TmdbMovieId: "$movie.TmdbMovieId",
          IMDBid: "$movie.IMDBid",
        },
      },
    ]);

    return res.status(200).json({ status: true, message: "Success", trailer });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};
