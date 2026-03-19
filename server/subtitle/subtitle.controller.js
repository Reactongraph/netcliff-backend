const Subtitle = require("./subtitle.model");

//mongoose
const mongoose = require("mongoose");

//import model
const Movie = require("../movie/movie.model");

//deleteFromS3
const { deleteFromS3 } = require("../../util/deleteFromS3");

exports.store = async (req, res) => {
  try {
    if (!req.body.language || !req.body.file || !req.body.movie) {
      return res
        .status(200)
        .json({ status: false, message: "Oops ! Invalid details." });
    }

    const movie = await Movie.findById(req.body.movie);
    if (!movie) {
      return res
        .status(200)
        .json({ status: false, message: "Movie does not found!!" });
    }

    const subtitle = new Subtitle();

    subtitle.language = req.body.language;
    subtitle.file = req.body.file;
    subtitle.movie = req.body.movie;
    await subtitle.save();

    const data = await Subtitle.aggregate([
      {
        $match: { _id: subtitle._id },
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
        $lookup: {
          from: "languages",
          localField: "language",
          foreignField: "_id",
          as: "languageData",
        },
      },
      {
        $unwind: {
          path: "$languageData",
          preserveNullAndEmptyArrays: false,
        },
      },
      {
        $project: {
          languageName: "$languageData.name",
          languageId: "$languageData.uniqueId",
          language: 1,
          file: 1,
          createdAt: 1,
          movieTitle: "$movie.title",
          movie: "$movie._id",
        },
      },
    ]);

    return res.status(200).json({
      status: true,
      message: "SUbtitle Added Successfully.",
      subtitle: data[0],
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

exports.destroy = async (req, res) => {
  try {
    const subtitle = await Subtitle.findById(
      mongoose.Types.ObjectId(req.query.subtitleId)
    );
    if (!subtitle) {
      return res
        .status(200)
        .json({ status: false, message: "Subtitle does not found." });
    }

    if (subtitle.file) {
      await deleteFromS3({ s3Url: subtitle.file });
    }

    await subtitle.deleteOne();

    return res
      .status(200)
      .json({ status: true, message: "Subtitle deleted by admin." });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

exports.get = async (req, res) => {
  try {
    const subtitle = await Subtitle.aggregate([
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
        $lookup: {
          from: "languages",
          localField: "language",
          foreignField: "_id",
          as: "languageData",
        },
      },
      {
        $unwind: {
          path: "$languageData",
          preserveNullAndEmptyArrays: false,
        },
      },
      {
        $project: {
          languageName: "$languageData.name",
          languageId: "$languageData.uniqueId",
          language: 1,
          file: 1,
          createdAt: 1,
          movieTitle: "$movie.title",
          movie: "$movie._id",
        },
      },
    ]);

    return res.status(200).json({ status: true, message: "Success", subtitle });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

exports.getIdWise = async (req, res) => {
  try {
    if (!req.query.movie) {
      return res
        .status(200)
        .json({ status: true, message: "movie Id must be requried!" });
    }

    const movie = await Movie.findById(req.query.movie);
    if (!movie) {
      return res
        .status(500)
        .json({ status: false, message: "No Movie Was Found." });
    }

    const subtitle = await Subtitle.aggregate([
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
        $lookup: {
          from: "languages",
          localField: "language",
          foreignField: "_id",
          as: "languageData",
        },
      },
      {
        $unwind: {
          path: "$languageData",
          preserveNullAndEmptyArrays: false,
        },
      },
      {
        $project: {
          languageName: "$languageData.name",
          languageId: "$languageData.uniqueId",
          language: 1,
          file: 1,
          createdAt: 1,
          movieTitle: "$movie.title",
          movie: "$movie._id",
        },
      },
    ]);

    return res.status(200).json({ status: true, message: "Success", subtitle });
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json({ status: false, error: error.message || "Internal Server Error" });
  }
};
