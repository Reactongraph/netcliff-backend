const Subtitle = require("./subtitle.model");

//mongoose
const mongoose = require("mongoose");

//import model
const Movie = require("../movie/movie.model");
const Episode = require("../episode/episode.model");

//deleteFromAzure
const { deleteFromAzure } = require("../../util/deleteFromAzure");

exports.store = async (req, res) => {
  try {
    if (!req.body.language || !req.body.file || (!req.body.movie && !req.body.episode)) {
      return res
        .status(200)
        .json({ status: false, message: "Oops ! Invalid details." });
    }

    const query = { language: req.body.language };
    if (req.body.movie) query.movie = req.body.movie;
    if (req.body.episode) query.episode = req.body.episode;

    const subtitleExists = await Subtitle.findOne(query);
    if (subtitleExists) {
      return res
        .status(200)
        .json({ status: false, message: "Subtitle already exists in the selected language." });
    }

    if (req.body.movie) {
      const movie = await Movie.findById(req.body.movie);
      if (!movie) {
        return res
          .status(200)
          .json({ status: false, message: "Movie does not found!!" });
      }
    }

    if (req.body.episode) {
      const episode = await Episode.findById(req.body.episode);
      if (!episode) {
        return res
          .status(200)
          .json({ status: false, message: "Episode does not found!!" });
      }
    }

    const subtitle = new Subtitle();
    subtitle.language = req.body.language;
    subtitle.file = req.body.file;
    if (req.body.movie) subtitle.movie = req.body.movie;
    if (req.body.episode) subtitle.episode = req.body.episode;
    await subtitle.save();

    await subtitle.populate("language");
    if (subtitle.movie) await subtitle.populate("movie");
    if (subtitle.episode) await subtitle.populate("episode");

    const responseData = {
      _id: subtitle._id,
      languageName: subtitle.language?.name,
      languageId: subtitle.language?.uniqueId,
      language: subtitle.language?._id,
      file: subtitle.file,
      createdAt: subtitle.createdAt,
    };
    if (subtitle.movie) {
      responseData.movieTitle = subtitle.movie.title;
      responseData.movie = subtitle.movie._id;
    }
    if (subtitle.episode) {
      responseData.episodeName = subtitle.episode.name;
      responseData.episode = subtitle.episode._id;
    }

    return res.status(200).json({
      status: true,
      message: "Subtitle Added Successfully.",
      subtitle: responseData,
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
      await deleteFromAzure({ cdnUrl: subtitle.file });
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
    if (!req.query.movie && !req.query.episode) {
      return res
        .status(200)
        .json({ status: true, message: "movie Id or episode Id must be required!" });
    }

    const matchQuery = {};
    if (req.query.movie) {
      matchQuery.movie = mongoose.Types.ObjectId(req.query.movie);
    }
    if (req.query.episode) {
      matchQuery.episode = mongoose.Types.ObjectId(req.query.episode);
    }

    const subtitle = await Subtitle.aggregate([
      { $match: matchQuery },
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
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "episodes",
          localField: "episode",
          foreignField: "_id",
          as: "episode",
        },
      },
      {
        $unwind: {
          path: "$episode",
          preserveNullAndEmptyArrays: true,
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
          language: req.query.populateLanguage === "true" ? "$languageData" : 1,
          file: 1,
          createdAt: 1,
          movieTitle: "$movie.title",
          movie: "$movie._id",
          episodeName: "$episode.name",
          episode: "$episode._id",
        },
      },
      { $sort: { languageName: 1 } },
    ]);

    return res.status(200).json({ status: true, message: "Success", subtitle });
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json({ status: false, error: error.message || "Internal Server Error" });
  }
};

// Mobile API: Get subtitles by movie or episode content ID
exports.getById = async (req, res) => {
  try {
    if (!req.params.contentId) {
      return res
        .status(400)
        .json({ status: false, message: "Content Id is required!" });
    }

    const contentId = req.params.contentId;
    const route = req.route.path;
    const isEpisode = route.includes("/episode");

    let subtitles;
    if (isEpisode) {
      subtitles = await Subtitle.find({ episode: contentId }).populate("language");
    } else {
      subtitles = await Subtitle.find({ movie: contentId }).populate("language");
    }

    if (!subtitles.length) {
      return res
        .status(400)
        .json({ status: false, message: "No Subtitle Was Found." });
    }

    subtitles = subtitles.sort((a, b) =>
      (a.language?.name || "").localeCompare(
        b.language?.name || "",
        undefined,
        { sensitivity: "base" }
      )
    );

    return res.status(200).json({ status: true, message: "Success", subtitles });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

// Update subtitle status
exports.updateStatus = async (req, res) => {
  try {
    const { subtitleId } = req.query;
    const { status } = req.body;

    if (!subtitleId) {
      return res.status(400).json({
        status: false,
        message: "Subtitle ID is required",
      });
    }

    if (!status || !["DRAFT", "PUBLISHED", "ARCHIVED"].includes(status)) {
      return res.status(400).json({
        status: false,
        message: "Invalid status. Must be one of: DRAFT, PUBLISHED, ARCHIVED",
      });
    }

    const subtitle = await Subtitle.findByIdAndUpdate(
      subtitleId,
      { status },
      { new: true }
    );

    if (!subtitle) {
      return res.status(404).json({
        status: false,
        message: "Subtitle not found",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Subtitle status updated successfully",
      subtitleId: subtitle._id,
      newStatus: status,
    });
  } catch (error) {
    console.error("Error updating subtitle status:", error);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};
