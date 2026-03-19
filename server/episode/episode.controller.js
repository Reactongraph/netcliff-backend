
//mongoose
const mongoose = require("mongoose");

//import model
const Episode = require("./episode.model");
const Movie = require("../movie/movie.model");
const Like = require("../like/like.model");
const Favorite = require("../favorite/favorite.model");
const Season = require("../season/season.model");
const MuxUpload = require("../models/MuxUpload");
const { muxClient, muxDrmClient } = require('../../config/mux');

//deleteFromS3
const { deleteFromS3 } = require("../../util/deleteFromS3");
const { createAndTriggerTranscodingJob, createUniqueResourceId } = require("../../util/hls");

//create episode
exports.store = async (req, res) => {
  try {
    if (
      !req.body.name ||
      !req.body.episodeNumber ||
      !req.body.season ||
      !req.body.movieId ||
      (req.body.videoType === undefined || req.body.videoType === null)
    ) {
      return res
        .status(200)
        .json({ status: false, message: "Oops ! Invalid details." });
    }

    if (!req.body.movieId || !req.body.season) {
      return res.status(200).json({
        status: false,
        message: "movieId and seasonId must be requried.",
      });
    }

    const movie = await Movie.findById(req.body.movieId);
    if (!movie) {
      return res
        .status(200)
        .json({ status: false, message: "Movie does not found." });
    }

    const season = await Season.findById(req.body.season);
    if (!season) {
      return res
        .status(200)
        .json({ status: false, message: "Season does not found." });
    }

    // For Mux uploads (videoType 8)
    const videoType = Number(req.body.videoType);
    if (videoType === 8) {
      if (!req.body.uploadId) {
        return res
          .status(200)
          .json({ status: false, message: "uploadId is required for Mux uploads" });
      }

      // Check if we have a Mux upload record
      const muxUpload = await MuxUpload.findOne({ uploadId: req.body.uploadId });

      // If we find a record and it has an error, return the error
      if (muxUpload?.status === 'error') {
        return res
          .status(200)
          .json({ status: false, message: `Mux upload failed: ${muxUpload.error || 'Unknown error'}` });
      }

      // If we find a record and it's ready, use the playbackId
      if (muxUpload?.status === 'ready') {
        req.body.hlsFileName = muxUpload.playbackId;
        if (muxUpload.duration) {
          req.body.runtime = muxUpload.duration;
        }

        await MuxUpload.deleteOne({ uploadId: req.body.uploadId });

      } else {
        // If no record or status is pending, use uploadId as temporary value
        // This means the webhook hasn't arrived yet
        req.body.hlsFileName = req.body.uploadId;
      }
    } else if (!req.body.videoUrl || req.body.videoUrl.trim() === '') {
      return res
        .status(200)
        .json({ status: false, message: "Please provide Video URL" });
    }

    const episode = new Episode();

    episode.image = req.body.image || ''; // Make image optional
    episode.videoUrl = req.body.videoUrl || '';
    episode.name = req.body.name;
    episode.episodeNumber = req.body.episodeNumber;
    episode.runtime = req.body.runtime || 0;
    episode.videoType = req.body.videoType;
    episode.movie = movie._id;
    episode.season = season._id;
    episode.seasonNumber = season.seasonNumber;
    episode.updateType = req.body.updateType || 1;
    episode.convertUpdateType = {
      image: req.body.convertUpdateType?.image || 1,
      videoUrl: req.body.convertUpdateType?.videoUrl || 1
    };

    if (req.body.videoType === 8) {
      episode.hlsFileName = req.body.hlsFileName;
    }

    // Always set DRM enabled flag if provided, regardless of video type
    if (req.body.drmEnabled !== undefined) {
      episode.drmEnabled = req.body.drmEnabled;
    }

    season.episodeCount += 1;

    await Promise.all([season.save(), episode.save()]);

    const data = await Episode.aggregate([
      {
        $match: { _id: episode._id },
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
          episodeNumber: 1,
          seasonNumber: 1,
          hlsFileName: 1,
          season: 1,
          runtime: 1,
          videoType: 1,
          videoUrl: 1,
          image: 1,
          TmdbMovieId: 1,
          createdAt: 1,
          title: "$movie.title",
          movieId: "$movie._id",
        },
      },
    ]);

    return res.status(200).json({
      status: true,
      message: "Episode Added Successfully.",
      Episode: data[0],
    });
  } catch (error) {
    console.log('Episode upload error:', error?.message);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

//update episode
exports.update = async (req, res) => {
  try {
    const episode = await Episode.findById(req.query.episodeId);
    if (!episode) {
      return res
        .status(200)
        .json({ status: false, message: "episode does not found!!" });
    }

    episode.name = req.body.name ? req.body.name : episode.name;
    episode.runtime = req.body.runtime ? req.body.runtime : episode.runtime;
    episode.videoType = req.body.videoType
      ? req.body.videoType
      : episode.videoType;
    episode.episodeNumber = req.body.episodeNumber
      ? req.body.episodeNumber
      : episode.episodeNumber;
    episode.movie = req.body.movie ? req.body.movie : episode.movie;
    episode.season = req.body.season ? req.body.season : episode.season;
    //episode.season = req.body.season ? req.body.season.split(",") : episode.season;

    //delete the old image and videoUrl from digitalOcean Spaces
    if (req.body.image) {
      if (!req.body.convertUpdateType || !req.body.updateType) {
        return res.status(200).json({
          status: false,
          message: "convertUpdateType and updateType must be requried.",
        });
      }

      const urlParts = episode.image.split("/");
      const keyName = urlParts.pop();
      const folderStructure = urlParts.slice(3).join("/");

      await deleteFromS3({ folderStructure, keyName });

      episode.updateType = Number(req.body.updateType) || 1; //always be 1
      episode.convertUpdateType.image =
        Number(req.body.convertUpdateType.image) || 1; //always be 1
      episode.image = req.body.image ? req.body.image : episode.image;
    }

    if (req.body.videoUrl) {
      if (
        req.body.videoType == 6 &&
        (!req.body.convertUpdateType || !req.body.updateType)
      ) {
        return res.status(200).json({
          status: false,
          message: "convertUpdateType and updateType must be requried.",
        });
      }

      const urlParts = episode?.videoUrl.split("/");
      const keyName = urlParts?.pop(); //remove the last element
      const folderStructure = urlParts?.slice(3).join("/"); //Join elements starting from the 4th element

      await deleteFromS3({ folderStructure, keyName });

      episode.updateType = Number(req.body.updateType) || 1; //always be 1
      episode.convertUpdateType.videoUrl =
        Number(req.body.convertUpdateType.videoUrl) || 1; //always be 1
      episode.videoUrl = req.body.videoUrl
        ? req.body.videoUrl
        : episode.videoUrl;
    }

    // Handle Mux uploads for updates (videoType 8)
    if (req.body.videoType === 8 && req.body.uploadId) {
      // Check if we have a Mux upload record
      const muxUpload = await MuxUpload.findOne({ uploadId: req.body.uploadId });

      // If we find a record and it has an error, return the error
      if (muxUpload?.status === 'error') {
        return res
          .status(200)
          .json({ status: false, message: `Mux upload failed: ${muxUpload.error || 'Unknown error'}` });
      }

      // If we find a record and it's ready, use the playbackId
      if (muxUpload?.status === 'ready') {
        req.body.hlsFileName = muxUpload.playbackId;
        if (muxUpload.duration) {
          req.body.runtime = muxUpload.duration;
        }
        // await MuxUpload.deleteOne({ uploadId: req.body.uploadId });
      } else {
        // If no record or status is pending, use uploadId as temporary value
        req.body.hlsFileName = req.body.uploadId;
      }
    }

    if (req.body.hlsFileName && req.body.hlsFileExt) {
      episode.hlsFileName = req.body.hlsFileName;
      episode.wwprResourceId = createUniqueResourceId("wwpr");
      episode.fpResourceId = createUniqueResourceId("fp");

      // const inputFile = `s3://${process.env.bucketName}/raw/${req.body.hlsFileName}.${req.body.hlsFileExt}`;
      // const outputBucket = `s3://${process.env.bucketName}/transcoded`;
      // const outputFolder = req.body.hlsFileName;

      // await createAndTriggerTranscodingJob(
      //   inputFile,
      //   outputBucket,
      //   outputFolder,
      //   episode.wwprResourceId,
      //   episode.fpResourceId
      // );
    }

    // Handle hlsFileName update even without hlsFileExt (for existing files or Mux uploads)
    if (req.body.hlsFileName && !req.body.hlsFileExt) {
      episode.hlsFileName = req.body.hlsFileName;
    }

    // Always set DRM enabled flag if provided, regardless of video type
    if (req.body.drmEnabled !== undefined) {
      episode.drmEnabled = req.body.drmEnabled;
    }

    //old seasonId
    const episodeData = await Episode.findOne({ _id: episode._id });
    const oldSeasonId = episodeData.season;
    const oldSeasonData = await Season.findById(oldSeasonId);

    //new seasonId
    const NewSeasonData = await Season.findById(req.body.season);

    oldSeasonData.episodeCount -= 1;
    NewSeasonData.episodeCount += 1;

    await Promise.all([
      oldSeasonData.save(),
      NewSeasonData.save(),
      episode.save(),
    ]);

    const data = await Episode.aggregate([
      {
        $match: { _id: episode._id },
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
          episodeNumber: 1,
          seasonNumber: 1,
          hlsFileName: 1,
          season: 1,
          runtime: 1,
          videoType: 1,
          videoUrl: 1,
          image: 1,
          drmEnabled: 1, // Include DRM enabled field
          title: "$movie.title",
          movieId: "$movie._id",
        },
      },
    ]);

    return res.status(200).json({
      status: true,
      message: "Episode Updated Successfully.",
      episode: data[0],
    });
  } catch (error) {
    console.log('episdoe update error:', error?.message);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

//get episode
exports.get = async (req, res) => {
  try {
    const episode = await Episode.aggregate([
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
          image: 1,
          videoType: 1,
          videoUrl: 1,
          seasonNumber: 1,
          season: 1,
          runtime: 1,
          episodeNumber: 1,
          hlsFileName: 1,
          TmdbMovieId: 1,
          updateType: 1,
          convertUpdateType: 1,
          createdAt: 1,
          status: 1,
          drmEnabled: 1, // Include DRM enabled field
          title: "$movie.title",
          movieId: "$movie._id",
        },
      },
    ]);

    return res.status(200).json({
      status: true,
      message: "Retrive episodes by the admin.",
      episode,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

//delete episode
exports.destroy = async (req, res) => {
  try {
    const episode = await Episode.findById(
      mongoose.Types.ObjectId(req.query.episodeId)
    );
    if (!episode) {
      return res
        .status(200)
        .json({ status: false, message: "Episode does not found." });
    }

    //delete the old image and videoUrl from digitalOcean Spaces
    if (episode.image) {
      const urlParts = episode.image.split("/");
      const keyName = urlParts.pop();
      const folderStructure = urlParts.slice(3).join("/");

      await deleteFromS3({ folderStructure, keyName });
    }

    if (episode.videoUrl) {
      const urlParts = episode.videoUrl.split("/");
      const keyName = urlParts.pop();
      const folderStructure = urlParts.slice(3).join("/");

      await deleteFromS3({ folderStructure, keyName });
    }

    const episodeData = await Episode.findOne({ _id: episode._id });
    const seasonId = episodeData.season;
    await Season.updateOne({ _id: seasonId }, { $inc: { episodeCount: -1 } });

    await episode.deleteOne();

    return res
      .status(200)
      .json({ status: true, message: "Episode deleted by the admin." });
  } catch (error) {
    console.log('Episode delete error', error?.message);
    return res
      .status(500)
      .json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//get season wise episode for admin
exports.seasonWiseEpisode = async (req, res) => {
  try {
    const movie = await Movie.findById(req.query.movieId);
    if (!movie) {
      return res
        .status(200)
        .json({ status: false, message: "No Movie Was found." });
    }

    const season = await Season.findOne({
      _id: new mongoose.Types.ObjectId(req?.query?.seasonId?.trim()),
    });

    if (req.query.seasonId) {
      if (req.query.seasonId === "AllSeasonGet") {
        const episode = await Episode.aggregate([
          {
            $match: {
              movie: movie._id,
            },
          },
          { $sort: { seasonNumber: 1, episodeNumber: 1 } },
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
              image: 1,
              videoType: 1,
              videoUrl: 1,
              episodeNumber: 1,
              seasonNumber: 1,
              TmdbMovieId: 1, //show_id
              updateType: 1,
              convertUpdateType: 1,
              createdAt: 1,
              hlsFileName: 1,
              season: 1,
              status: 1,
              drmEnabled: 1, // Include DRM enabled field
              title: "$movie.title",
              movieId: "$movie._id",
            },
          },
        ]);

        return res.status(200).json({
          status: true,
          message: "Retrive season's episodes!",
          episode,
        });
      } else {
        if (!season) {
          return res
            .status(200)
            .json({ status: false, message: "No Season Was Found!!" });
        }

        const episode = await Episode.aggregate([
          {
            $match: {
              $and: [{ movie: movie._id }, { season: season._id }],
            },
          },
          {
            $sort: { episodeNumber: 1 },
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
              _id: 1,
              name: 1,
              episodeNumber: 1,
              seasonNumber: 1,
              season: 1,
              runtime: 1,
              TmdbMovieId: 1, //show_id
              videoType: 1,
              videoUrl: 1,
              image: 1,
              updateType: 1,
              hlsFileName: 1,
              convertUpdateType: 1,
              createdAt: 1,
              status: 1,
              drmEnabled: 1, // Include DRM enabled field
              season: 1,
              movieId: "$movie._id",
              title: "$movie.title",
            },
          },
        ]);

        return res.status(200).json({
          status: true,
          message: "get Season Wise episodes!",
          episode,
        });
      }
    } else {
      return res
        .status(200)
        .json({ status: true, message: "seasonId must be requried." });
    }
  } catch (error) {
    console.log('Season Wise episode error', error?.message);
    return res
      .status(500)
      .json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//get season wise episode for android
exports.seasonWiseEpisodeAndroid = async (req, res) => {
  try {
    const movie = await Movie.findById(req.query.movieId);
    if (!movie) {
      return res
        .status(200)
        .json({ status: false, message: "No Movie Was Found." });
    }

    // Get user ID if authenticated
    const userId = req.user?.userId ? new mongoose.Types.ObjectId(req.user.userId) : null;

    // Build aggregation pipeline
    const pipeline = [
      {
        $match: {
          $and: [
            { movie: movie._id },
            { seasonNumber: parseInt(req.query.seasonNumber) },
            { status: "PUBLISHED" }
          ],
        },
      },
      {
        $sort: { episodeNumber: 1 },
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
    ];

    // Only add user-specific lookups if user is authenticated
    if (userId) {
      // Lookup user's favorite status for each episode
      pipeline.push({
        $lookup: {
          from: "favorites",
          let: { episodeId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$episodeId", "$$episodeId"] },
                    { $eq: ["$type", "tv"] },
                    { $eq: ["$userId", userId] }
                  ]
                }
              }
            }
          ],
          as: "userFavorite"
        }
      });

      // Lookup user's like status for each episode
      pipeline.push({
        $lookup: {
          from: "likes",
          let: { episodeId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$episodeId", "$$episodeId"] },
                    { $eq: ["$type", "tv"] },
                    { $eq: ["$userId", userId] }
                  ]
                }
              }
            }
          ],
          as: "userLike"
        }
      });

      // Project with user-specific fields for authenticated users
      pipeline.push({
        $project: {
          _id: 1,
          name: 1,
          episodeNumber: 1,
          seasonNumber: 1,
          hlsFileName: 1,
          season: 1,
          runtime: 1,
          TmdbMovieId: 1, //show_id
          videoType: 1,
          videoUrl: 1,
          image: 1,
          drmEnabled: 1, // Include DRM enabled field
          movieId: "$movie._id",
          title: "$movie.title",
          favorite: "$favorite",
          isFavorite: { $gt: [{ $size: "$userFavorite" }, 0] },
          like: "$like",
          isLike: { $gt: [{ $size: "$userLike" }, 0] },
          view: "$view",
          share: "$share",
        },
      });
    } else {
      // Project without user-specific fields for anonymous users
      pipeline.push({
        $project: {
          _id: 1,
          name: 1,
          episodeNumber: 1,
          seasonNumber: 1,
          hlsFileName: 1,
          season: 1,
          runtime: 1,
          TmdbMovieId: 1, //show_id
          videoType: 1,
          videoUrl: 1,
          image: 1,
          drmEnabled: 1, // Include DRM enabled field
          movieId: "$movie._id",
          title: "$movie.title",
          favorite: "$favorite",
          isFavorite: { $literal: false },
          like: "$like",
          isLike: { $literal: false },
          view: "$view",
          share: "$share",
        },
      });
    }

    const episode = await Episode.aggregate(pipeline, { gamification: true });

    return res
      .status(200)
      .json({ status: true, message: "Retrive season wise episode!", episode });
  } catch (error) {
    console.log('Season wise episode android error', error?.message);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

//get movie only if type web series
exports.getSeries = async (req, res) => {
  try {
    var matchQuery;

    if (req.query.type === "SERIES") {
      matchQuery = { media_type: "tv" };
    }

    const movie = await Movie.find(matchQuery).sort({ createdAt: 1 });

    return res.status(200).json({ status: true, message: "Success", movie });
  } catch (error) {
    console.log('Episode get series error', error?.message);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// HLS ----

exports.hlsSignedUrl = async (req, res) => {
  let { hlsFileName } = req.query;

  if (!hlsFileName) {
    res
      .status(400)
      .json({ status: false, message: "Please provide directory name." });
  }

  try {
    // // If serving from private bucket
    url = `${process.env.AWS_CLOUDFRONT_DISTRIBUTION}/transcoded/${hlsFileName}/`;
    // const signedUrl = await cloudFrontSignedUrl(url);
    // const urlParm = signedUrl.split("?")[1];
    // const wwprUrl = `${url}wwpr.mpd?${urlParm}`;
    // const fpUrl = `${url}fp.m3u8?${urlParm}`;
    // const noDrmUrl = `${url}nodrm.m3u8?${urlParm}`;

    const wwprUrl = `${url}wwpr.mpd`;
    const fpUrl = `${url}fp.m3u8`;
    const noDrmUrl = `${url}nodrm.m3u8`;
    res.status(200).json({
      status: true,
      wwprUrl,
      fpUrl,
      noDrmUrl,
      url: noDrmUrl,
      wwProxy: process.env.widewine_proxy_url,
      prProxy: process.env.playready_proxy_url,
    });

    // If serving from public bucket
    // url = `${process.env.endpoint}/transcoded/${hlsFileName}/`;

    // const wwprUrl = `${url}wwpr.mpd`;
    // const fpUrl = `${url}fp.m3u8`;
    // const noDrmUrl = `${url}nodrm.m3u8`;
    // res.status(200).json({
    //   status: true,
    //   wwprUrl,
    //   fpUrl,
    //   noDrmUrl,
    //   wwProxy: process.env.widewine_proxy_url,
    //   prProxy: process.env.playready_proxy_url,
    //   url: noDrmUrl,
    // });
  } catch (error) {
    console.error("Error creating signed URL", error);
    res.status(500).json({ status: false, message: "Internal server error." });
  }
};

// Update episode status
exports.updateStatus = async (req, res) => {
  try {
    const { episodeId } = req.query;
    const { status } = req.body;

    if (!episodeId) {
      return res.status(400).json({
        status: false,
        message: "Episode ID is required",
      });
    }

    if (!status || !["DRAFT", "PUBLISHED", "ARCHIVED"].includes(status)) {
      return res.status(400).json({
        status: false,
        message: "Invalid status. Must be one of: DRAFT, PUBLISHED, ARCHIVED",
      });
    }

    const episode = await Episode.findByIdAndUpdate(
      episodeId,
      { status },
      { new: true }
    );

    if (!episode) {
      return res.status(404).json({
        status: false,
        message: "Episode not found",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Status updated successfully",
      episodeId: episode._id,
      newStatus: status
    });
  } catch (error) {
    console.error("Error updating episode status:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

// Increment share counter
exports.incrementShare = async (req, res) => {
  try {
    const { episodeId } = req.body;

    if (!episodeId) {
      return res.status(400).json({
        status: false,
        message: "Episode ID is required"
      });
    }

    const episode = await Episode.findById(episodeId);

    if (!episode) {
      return res.status(404).json({
        status: false,
        message: "Episode not found"
      });
    }

    // Increment share counter
    const updatedEpisode = await Episode.findByIdAndUpdate(
      episodeId,
      { $inc: { share: 1 } },
      { new: true }
    );

    return res.status(200).json({
      status: true,
      message: "Share counter incremented successfully",
      data: {
        episodeId: updatedEpisode._id,
        shareCount: updatedEpisode.share
      }
    });
  } catch (error) {
    console.error("Error incrementing share counter:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error.message
    });
  }
};
// Check user status for multiple episodes (like/favorite) using facet aggregation
exports.checkEpisodeStatus = async (req, res) => {
  try {
    const { episodeIds } = req.body;
    const userId = req.user?.userId;

    if (!episodeIds || !Array.isArray(episodeIds) || episodeIds.length === 0) {
      return res.status(400).json({
        status: false,
        message: "Episode IDs array is required."
      });
    }

    if (!userId) {
      return res.status(200).json({
        status: true,
        message: "User not authenticated",
      });
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const episodeObjectIds = episodeIds.map(id => new mongoose.Types.ObjectId(id));

    const [favorites, likes] = await Promise.all([
      Favorite.find({
        episodeId: { $in: episodeObjectIds },
        userId: userObjectId,
        type: "tv"
      }, 'episodeId'),

      Like.find({
        episodeId: { $in: episodeObjectIds },
        userId: userObjectId,
        type: "tv"
      }, 'episodeId')
    ]);

    const favoriteSet = new Set(favorites.map(f => f.episodeId.toString()));
    const likeSet = new Set(likes.map(l => l.episodeId.toString()));

    const episodes = [];
    episodeIds.forEach(id => {
      return episodes.push({
        episodeId: id,
        isFavorite: favoriteSet.has(id),
        isLike: likeSet.has(id)
      });
    });

    return res.status(200).json({
      status: true,
      message: "Episode status retrieved successfully",
      episodes
    });

  } catch (error) {
    console.error("Error checking episode status:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error"
    });
  }
};

// Sync episode runtime from Mux assets
exports.syncRuntimeFromMux = async (req, res) => {
  try {

    // Find episodes with null, non-number, or missing runtime and Mux video type
    const episodes = await Episode.find({
      $or: [
        { runtime: null },
        { runtime: { $type: "string" } },
        { runtime: { $exists: false } }
      ],
      videoType: 8, // Mux video type
      hlsFileName: { $exists: true, $ne: null }
    });

    if (episodes.length === 0) {
      return res.json({
        status: true,
        message: "No episodes need runtime sync",
        updated: 0
      });
    }

    let updated = 0;
    const errors = [];

    const muxPage = parseInt(req.query.muxPage) || 1;
    const muxLimit = parseInt(req.query.muxLimit) || 100;

    const response = await muxClient.video.assets.list({ page: muxPage, limit: muxLimit });
    const drmResponse = await muxDrmClient.video.assets.list({ page: muxPage, limit: muxLimit });

    for (const episode of episodes) {
      try {
        let asset = null;
        // Check normal Mux environment first
        try {
          asset = response.data.find(a =>
            a.playback_ids && a.playback_ids.some(p => p.id === episode.hlsFileName)
          );
        } catch (err) {
          console.log('Error checking normal Mux:', err.message);
        }
        // If not found in normal, check DRM environment
        if (!asset) {
          try {
            asset = drmResponse.data.find(a =>
              a.playback_ids && a.playback_ids.some(p => p.id === episode.hlsFileName)
            );
          } catch (err) {
            console.log('Error checking DRM Mux:', err.message);
          }
        }

        if (asset && asset.duration) {
          await Episode.findByIdAndUpdate(episode._id, {
            runtime: Math.round(asset.duration)
          });
          updated++;
        }
      } catch (error) {
        errors.push({
          episodeId: episode._id,
          error: error.message
        });
      }
    }

    return res.json({
      status: true,
      message: `Runtime sync completed. Updated ${updated} episodes.`,
      updated,
      total: episodes.length,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error("Error syncing runtime from Mux:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error"
    });
  }
};