const Movie = require("../movie/movie.model");
const Episode = require("../episode/episode.model");
const ViewedContent = require("./viewedContent.model");
const User = require("../user/user.model");
const recombeeService = require('../services/recombee.service');
const { SUBSCRIPTION_TYPES } = require('../../util/constants');
// Generate Mux URLs for series with first and second episodes
const { generateHlsSignedUrls } = require("../movie/movie.controller");
const { getFromCache, setCache } = require('../../util/redisUtils');

const mongoose = require("mongoose");

// Helper function to get unique content count efficiently
const getUniqueContentCount = async (matchQuery) => {
  try {
    const uniqueContentCount = await ViewedContent.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: {
            type: "$type",
            contentId: {
              $cond: {
                if: { $eq: ["$type", "movie"] },
                then: "$movieId",
                else: "$episodeId"
              }
            }
          }
        }
      },
      { $count: "uniqueContent" }
    ]);

    return uniqueContentCount[0]?.uniqueContent || 0;
  } catch (error) {
    console.error("Error calculating unique content count:", error);
    return 0;
  }
};

// Helper function to update free trial watch count
const updateFreeTrialCount = async (userId, count) => {
  try {
    await User.findByIdAndUpdate(
      userId,
      { $set: { "freeTrial.watchedCount": count } },
      { new: true }
    );
  } catch (error) {
    console.error("Error updating free trial count:", error);
  }
};

// Shared formatter for continue watching series entries
const formatContinueWatchingSeries = async (series, episode, endTime, lastViewedTime) => {
  try {
    if (!series || !episode) return null;

    let watchDetails = null;
    if (episode.hlsFileName) {
      try {
        const cacheKey = `hls:${episode.hlsFileName}:${episode.drmEnabled ? "drm" : "nodrm"}`;
        watchDetails = await getFromCache(cacheKey);

        if (!watchDetails) {
          watchDetails = await generateHlsSignedUrls(
            episode.hlsFileName,
            episode.drmEnabled || false
          );
          await setCache(cacheKey, watchDetails, process.env.REDIS_TTL);
        }
      } catch (error) {
        console.error("Error processing episode watch details in formatter:", error);
      }
    }

    const viewMultiplier = global.settingJSON?.viewMultiplier || 1;
    const viewConstant = global.settingJSON?.viewConstant || 0;
    const gamifiedView = (viewMultiplier * (series.view || 0)) + viewConstant;

    return {
      _id: series._id,
      view: gamifiedView,
      newReleased: series.newReleased,
      image: series.image,
      thumbnail: series.thumbnail,
      isCachedOnHome: series.isCachedOnHome,
      title: series.title,
      description: series.description,
      createdAt: series.createdAt,
      updatedAt: series.updatedAt,
      genre: series.genre,
      firstEpisode: {
        ...episode,
        lastWatchedEndTime: endTime,
        lastViewedTime: lastViewedTime
      },
      firstEpisodeWatchDetails: watchDetails,
    };
  } catch (error) {
    console.error("Error formatting continue watching series:", error);
    return null;
  }
};

exports.store = async (req, res) => {
  const { movieId, episodeId, startTime, endTime, isCompleted, deviceId, deviceType } =
    req.body;

  try {
    if ((!movieId && !episodeId) || !deviceId || !deviceType) {
      return res.status(400).json({
        status: false,
        message: "Invalid data. Please provide movie/episode ID, device ID, device Type",
      });
    }

    // Convert and validate startTime and endTime
    const startTimeNum = Number(startTime);
    const endTimeNum = Number(endTime);

    if (startTime === null || startTime === undefined || endTime === null || endTime === undefined || isNaN(startTimeNum) || isNaN(endTimeNum)) {
      return res.status(400).json({
        status: false,
        message: "Start time and end time are required and must be valid numbers",
      });
    }

    if (startTimeNum < 0 || endTimeNum < 0) {
      return res.status(400).json({
        status: false,
        message: "Start time and end time must be non-negative numbers",
      });
    }

    if (endTimeNum < startTimeNum) {
      return res.status(400).json({
        status: false,
        message: "End time must be greater than or equal to start time",
      });
    }

    let existing;
    let contentType;

    // Determine content type based on what's provided
    if (episodeId) {
      // If episodeId is present, it's TV content
      existing = await Episode.findOne({
        _id: episodeId,
      });
      contentType = "tv";
    } else if (movieId) {
      // If only movieId is present, it's a movie
      existing = await Movie.findOne({
        _id: movieId,
      });
      contentType = "movie";
    } else {
      return res.status(400).json({
        status: false,
        error: "Invalid data. Movie/Episode ID",
      });
    }

    if (!existing) {
      return res.status(404).json({
        status: false,
        error: "Movie/Episode not found",
      });
    }

    // Determine if user is authenticated or anonymous
    const isAuthenticated = req.user && req.user.userId;

    // Determine subscription type
    let subscriptionType = SUBSCRIPTION_TYPES.FREE
    if (isAuthenticated && req.user.isPremiumPlan && req.user.plan?.planStartDate && req.user.plan?.planEndDate) {
      const planDuration = new Date(req.user.plan.planEndDate) - new Date(req.user.plan.planStartDate);
      const fifteenDaysInMs = 15 * 24 * 60 * 60 * 1000;

      if (planDuration >= fifteenDaysInMs) {
        subscriptionType = SUBSCRIPTION_TYPES.PREMIUM;
      } else
        subscriptionType = SUBSCRIPTION_TYPES["FREE-TRAIL"];
    }

    // Create new record every time for analytics
    const newRecord = new ViewedContent({
      userId: isAuthenticated ? req.user.userId : null, // Use userId if authenticated, null if anonymous
      movieId: movieId, // Always store movieId (parent series for TV, movie itself for movies)
      episodeId: contentType === "tv" ? episodeId : null,
      type: contentType,
      startTime: startTimeNum,
      endTime: endTimeNum,
      watchTime: endTimeNum - startTimeNum, // Calculate watch time
      lastViewedTime: new Date(),
      deviceId,
      deviceType,
      isCompleted: !!isCompleted,
      subscriptionType: subscriptionType,
    });
    await newRecord.save();

    // Track interaction in Recombee - for premium and free trial users
    if (req.user && req.user.userId && (subscriptionType === SUBSCRIPTION_TYPES.PREMIUM || subscriptionType === SUBSCRIPTION_TYPES["FREE-TRAIL"])) {
      try {
        const itemId = movieId;
        await recombeeService.addInteraction(
          req.user.userId,
          itemId,
          'view',
          null,
          new Date(),
          endTimeNum - startTimeNum
        );

        const totalRuntime = existing?.runtime || 0;
        if (totalRuntime > 0) {
          const viewPortion = Math.min(endTimeNum / totalRuntime, 1);
          if (viewPortion > 0.05) {
            await recombeeService.setViewPortion(req.user.userId, itemId, viewPortion);
          }
        }

        if (isCompleted) {
          await recombeeService.addInteraction(
            req.user.userId,
            itemId,
            'rating',
            0.8,
            new Date()
          );
        }
      } catch (recombeeError) {
        console.error('Recombee tracking error:', recombeeError?.message);
      }
    }

    // Increment view count based on content type
    if (contentType === "movie") {
      await Movie.findByIdAndUpdate(movieId, { $inc: { view: 1 } });
    } else if (contentType === "tv") {
      await Episode.findByIdAndUpdate(episodeId, { $inc: { view: 1 } });
      // increasing view count in tv series also, to which the episode belong.
      if (movieId) {
        await Movie.findByIdAndUpdate(movieId, { $inc: { view: 1 } });
      }
    }

    // Increment free trial watch count for users with active free trial
    try {
      const user = req.user;
      if (user && user.freeTrial && user.freeTrial.isActive) {
        let matchQuery;

        if (isAuthenticated && !user.isPremiumPlan) {
          // Authenticated user with free trial
          matchQuery = {
            userId: new mongoose.Types.ObjectId(user.userId),
            $or: [
              { type: "movie", movieId: { $exists: true } },
              { type: "tv", episodeId: { $exists: true } }
            ]
          };
        } else if (!isAuthenticated && user.loginType === 3) {
          // Guest user with free trial (identified by deviceId)
          matchQuery = {
            deviceId: deviceId,
            userId: null, // Anonymous viewing records
            $or: [
              { type: "movie", movieId: { $exists: true } },
              { type: "tv", episodeId: { $exists: true } }
            ]
          };
        }

        if (matchQuery) {
          const currentCount = await getUniqueContentCount(matchQuery);
          // Update free trial count for guest users (userId will be the guest user's ID)
          const userIdToUpdate = isAuthenticated ? user.userId : user.userId; // Both cases use user.userId from auth middleware
          await updateFreeTrialCount(userIdToUpdate, currentCount);
        }
      }
    } catch (freeTrialError) {
      // Log the error but don't fail the main operation
      console.error("Error updating free trial watch count:", freeTrialError);
    }

    return res.status(200).json({
      status: true,
      viewedContentId: newRecord._id // Return the ID for potential updates
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error!",
    });
  }
};

const updateContinueWatchingCache = async (viewedRecord) => {
  try {
    if (!viewedRecord?.userId || !viewedRecord?.movieId || !viewedRecord?.episodeId) return;

    const cacheKey = `continue-watching:${viewedRecord.userId}`;
    const cachedData = await getFromCache(cacheKey);

    if (!cachedData || !Array.isArray(cachedData.series)) {
      return;
    }

    const [series, episode, lastEpisode] = await Promise.all([
      Movie.findById(viewedRecord.movieId).lean(),
      Episode.findById(viewedRecord.episodeId).lean(),
      Episode.findOne({ movie: viewedRecord.movieId, status: "PUBLISHED" })
        .sort({ seasonNumber: -1, episodeNumber: -1 })
        .select("_id")
        .lean()
    ]);

    const isLastEpisodeCompleted =
      viewedRecord.isCompleted &&
      lastEpisode &&
      lastEpisode._id.toString() === viewedRecord.episodeId.toString();

    const filteredSeries = cachedData.series.filter(
      (item) => item?._id?.toString() !== viewedRecord.movieId.toString()
    );

    if (!isLastEpisodeCompleted) {
      const updatedEntry = await formatContinueWatchingSeries(
        series,
        episode,
        viewedRecord.endTime,
        viewedRecord.lastViewedTime
      );

      if (updatedEntry) {
        filteredSeries.unshift(updatedEntry);
      }
    }

    cachedData.series = filteredSeries.slice(0, 10);

    await setCache(cacheKey, cachedData, process.env.REDIS_TTL || 3600);
  } catch (error) {
    console.error("Error updating continue watching cache:", error);
  }
};

// Update viewed content end time
exports.updateViewedContent = async (req, res) => {
  const { viewedContentId } = req.params;
  const { endTime, isCompleted } = req.body;

  try {
    if (!viewedContentId) {
      return res.status(400).json({
        status: false,
        message: "Viewed content ID is required"
      });
    }

    // Validate endTime
    const endTimeNum = Number(endTime);

    if (endTime === null || endTime === undefined || isNaN(endTimeNum)) {
      return res.status(400).json({
        status: false,
        message: "End time is required and must be a valid number"
      });
    }

    if (endTimeNum < 0) {
      return res.status(400).json({
        status: false,
        message: "End time must be a non-negative number"
      });
    }

    // Find the viewed content record
    const viewedContent = await ViewedContent.findById(viewedContentId);

    if (!viewedContent) {
      return res.status(404).json({
        status: false,
        message: "Viewed content record not found"
      });
    }

    // Update the record
    const updatedRecord = await ViewedContent.findByIdAndUpdate(
      viewedContentId,
      {
        endTime: endTimeNum,
        watchTime: endTimeNum - viewedContent.startTime, // Recalculate watch time
        isCompleted: !!isCompleted,
        lastViewedTime: new Date()
      },
      { new: true }
    );

    if (req.user?.userId && updatedRecord?.movieId && updatedRecord?.episodeId && updatedRecord?.type === "tv") {
      updateContinueWatchingCache(updatedRecord).catch((error) =>
        console.error("Error refreshing continue watching cache:", error)
      );
    }

    return res.status(200).json({
      status: true,
      message: "Viewed content updated successfully",
      data: {
        _id: updatedRecord._id,
        startTime: updatedRecord.startTime,
        endTime: updatedRecord.endTime,
        watchTime: updatedRecord.watchTime,
        isCompleted: updatedRecord.isCompleted,
        lastViewedTime: updatedRecord.lastViewedTime
      }
    });

  } catch (error) {
    console.error("Error updating viewed content:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error.message
    });
  }
};


// Get continue watching series for widget (similar to widget API response)
exports.getContinueWatchingSeries = async (req, res) => {
  try {
    const { page = 1, perPage = 10 } = req.query;
    const userId = req.user.userId;

    // Validate pagination parameters
    const paginationQuery = {
      page: parseInt(page) || 1,
      perPage: parseInt(perPage) || 10,
    };

    if (paginationQuery.page < 1) {
      paginationQuery.page = 1;
    }
    if (paginationQuery.perPage < 1 || paginationQuery.perPage > 100) {
      paginationQuery.perPage = 10;
    }

    // Build match query for authenticated user only
    const matchQuery = {
      type: "tv", // Only TV episodes
      userId: new require("mongoose").Types.ObjectId(userId)
    };

    // Get continue watching series with actual watched episode
    const continueWatchingSeries = await ViewedContent.aggregate([
      { $match: matchQuery },
      { $sort: { lastViewedTime: -1 } },
      {
        $lookup: {
          from: "episodes",
          localField: "episodeId",
          foreignField: "_id",
          as: "episode"
        }
      },
      { $unwind: { path: "$episode", preserveNullAndEmptyArrays: false } },
      {
        $lookup: {
          from: "movies",
          localField: "movieId",
          foreignField: "_id",
          as: "series"
        }
      },
      { $unwind: { path: "$series", preserveNullAndEmptyArrays: false } },
      {
        $group: {
          _id: "$movieId",
          lastViewedTime: { $max: "$lastViewedTime" },
          lastWatchedEpisode: { $first: "$episode" },
          isCompleted: { $first: "$isCompleted" },
          endTime: { $first: "$endTime" },
          series: { $first: "$series" },
          genre: { $first: "$series.genre" }
          // genreDetails: { $first: "$genreDetails" }
        }
      },
      // last watched episode details fetched to avoid watched series
      {
        $lookup: {
          from: "episodes",
          let: { seriesId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$movie", "$$seriesId"] }, status: "PUBLISHED" } },
            { $sort: { seasonNumber: -1, episodeNumber: -1 } },
            { $limit: 1 },
            { $project: { _id: 1 } }
          ],
          as: "absoluteLastEpisode"
        }
      },
      {
        $match: {
          $expr: {
            $not: {
              $and: [
                { $eq: ["$isCompleted", true] },
                {
                  $eq: [
                    "$lastWatchedEpisode._id",
                    { $arrayElemAt: ["$absoluteLastEpisode._id", 0] }
                  ]
                }
              ]
            }
          }
        }
      },
      { $sort: { lastViewedTime: -1 } },
      { $skip: (paginationQuery.page - 1) * paginationQuery.perPage },
      { $limit: paginationQuery.perPage },
      // {
      //   $project: {
      //     "series.runtime": 0,
      //     "lastWatchedEpisode.runtime": 0
      //   }
      // }
    ]);

    if (!continueWatchingSeries.length) {
      return res.status(200).json({
        status: true,
        message: "Continue watching series fetched successfully",
        series: [],
        page: paginationQuery.page,
        perPage: paginationQuery.perPage
      });
    }

    const enrichedSeries = await Promise.all(continueWatchingSeries.map(async (seriesItem) => {
      return await formatContinueWatchingSeries(
        seriesItem.series,
        seriesItem.lastWatchedEpisode,
        seriesItem.endTime,
        seriesItem.lastViewedTime
      );
    }));

    const responseData = {
      status: true,
      message: "Continue watching series fetched successfully",
      series: enrichedSeries,
      page: paginationQuery.page,
      perPage: paginationQuery.perPage
    };

    return res.status(200).json(responseData);

  } catch (error) {
    console.error("Error retrieving continue watching series:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// Get watch history for both authenticated and anonymous users
exports.getWatchHistory = async (req, res) => {
  try {
    const { page = 1, perPage = 10, movieId } = req.query;
    const deviceId = req.user.deviceId; // Get deviceId from authenticated user context

    if (!deviceId) {
      return res.status(400).json({
        status: false,
        message: "Device ID is required"
      });
    }

    // Validate pagination parameters
    const paginationQuery = {
      page: parseInt(page) || 1,
      perPage: parseInt(perPage) || 10,
    };

    if (paginationQuery.page < 1) {
      paginationQuery.page = 1;
    }
    if (paginationQuery.perPage < 1 || paginationQuery.perPage > 100) {
      paginationQuery.perPage = 10;
    }

    // Build match query based on user type
    const matchQuery = {
      type: "tv" // Only TV episodes, not movies
    };

    if (req.user.userId) {
      // Authenticated user - query by userId
      matchQuery.userId = new mongoose.Types.ObjectId(req.user.userId);
    } else {
      // Anonymous user - query by deviceId only
      matchQuery.deviceId = deviceId;
      matchQuery.userId = null;
    }

    // Add movieId filter if provided
    if (movieId) {
      matchQuery.movieId = new mongoose.Types.ObjectId(movieId);
    }

    // Optimized aggregation pipeline - group and paginate early
    const watchHistory = await ViewedContent.aggregate([
      { $match: matchQuery },
      { $sort: { lastViewedTime: -1 } },
      {
        $group: {
          _id: "$movieId",
          episodeId: { $first: "$episodeId" },
          lastViewedTime: { $max: "$lastViewedTime" },
          isCompleted: { $first: "$isCompleted" },
          startTime: { $first: "$startTime" },
          endTime: { $first: "$endTime" }
        }
      },
      // last watched episode details fetched to avoid watched series
      {
        $lookup: {
          from: "episodes",
          let: { seriesId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$movie", "$$seriesId"] }, status: "PUBLISHED" } },
            { $sort: { seasonNumber: -1, episodeNumber: -1 } },
            { $limit: 1 },
            { $project: { _id: 1 } }
          ],
          as: "absoluteLastEpisode"
        }
      },
      {
        $match: {
          $expr: {
            $not: {
              $and: [
                { $eq: ["$isCompleted", true] },
                {
                  $eq: [
                    "$episodeId", // This is the ID of the last watched episode from the group stage
                    { $arrayElemAt: ["$absoluteLastEpisode._id", 0] }
                  ]
                }
              ]
            }
          }
        }
      },
      { $sort: { lastViewedTime: -1 } },
      { $skip: (paginationQuery.page - 1) * paginationQuery.perPage },
      { $limit: paginationQuery.perPage },
      {
        $lookup: {
          from: "episodes",
          localField: "episodeId",
          foreignField: "_id",
          as: "episode"
        }
      },
      { $unwind: { path: "$episode", preserveNullAndEmptyArrays: false } },
      {
        $lookup: {
          from: "movies",
          localField: "_id",
          foreignField: "_id",
          as: "series"
        }
      },
      { $unwind: { path: "$series", preserveNullAndEmptyArrays: false } },
      {
        $lookup: {
          from: "genres",
          localField: "series.genre",
          foreignField: "_id",
          as: "genreDetails",
          pipeline: [
            {
              $project: {
                _id: 1,
                name: 1,
                description: 1
              }
            }
          ]
        }
      },
      {
        $project: {
          _id: 1,
          episodeId: 1,
          seriesId: "$series._id",
          seriesTitle: "$series.title",
          seriesThumbnail: "$series.thumbnail",
          seriesGenre: "$genreDetails",
          episodeName: "$episode.name",
          episodeNumber: "$episode.episodeNumber",
          seasonNumber: "$episode.seasonNumber",
          lastViewedTime: 1,
          isCompleted: 1,
          startTime: 1,
          endTime: 1,
          newReleased: "$series.newReleased"
        }
      }
    ]);

    // Set fixed metadata since we removed $facet
    const metadata = { total: 1000, page: paginationQuery.page, perPage: paginationQuery.perPage, totalPages: 100 };
    const episodes = watchHistory || [];

    return res.status(200).json({
      status: true,
      message: "Watch history retrieved successfully",
      episodeList: episodes,
      total: metadata.total,
      page: metadata.page,
      perPage: metadata.perPage,
      totalPages: metadata.totalPages,
      hasNextPage: metadata.page < metadata.totalPages,
      hasPrevPage: metadata.page > 1
    });

  } catch (error) {
    console.error("Error retrieving watch history:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error.message
    });
  }
};
