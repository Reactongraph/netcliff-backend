const Favorite = require("./favorite.model");

//import model
const User = require("../user/user.model");
const Movie = require("../movie/movie.model");
const Episode = require("../episode/episode.model");
const Widget = require("../widget/widget.model");
const mongoose = require("mongoose");
const { populateGenre, populateLanguage, populateRegion } = require("../movie/movie.aggregations");
const recombeeService = require('../services/recombee.service');

//create Favorite [Only User can do favorite]
exports.store = async (req, res) => {
  try {
    const { movieId, episodeId, type, skipUnfavorite } = req.body;

    if (!req.user.userId || !type || (!movieId && !episodeId)) {
      return res
        .status(200)
        .json({ status: false, message: "Oops ! Invalid details." });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res
        .status(200)
        .json({ status: false, message: "User does not found." });
    }

    let content;
    let favoriteQuery = { userId: user._id, type };

    // Validate content based on type
    if (type === "movie") {
      if (!movieId) {
        return res
          .status(200)
          .json({ status: false, message: "Movie ID is required for movie type." });
      }

      content = await Movie.findById(movieId);
      if (!content) {
        return res
          .status(200)
          .json({ status: false, message: "No Movie Was found." });
      }

      favoriteQuery.movieId = content._id;
      favoriteQuery.episodeId = null;

    } else if (type === "tv") {
      if (!episodeId) {
        return res
          .status(200)
          .json({ status: false, message: "Episode ID is required for TV type." });
      }

      content = await Episode.findById(episodeId);
      if (!content) {
        return res
          .status(200)
          .json({ status: false, message: "No Episode Was found." });
      }

      favoriteQuery.episodeId = content._id;
      favoriteQuery.movieId = content.movie; // Store parent series ID

    } else {
      return res
        .status(200)
        .json({ status: false, message: "Invalid type. Must be 'movie' or 'tv'." });
    }

    const favorite = await Favorite.findOne(favoriteQuery);

    //unfavorite and favorite
    if (favorite) {
      if (skipUnfavorite) {
        return res.status(200).json({
          status: true,
          message: "Already favorite",
          isFavorite: true,
        });
      }

      await Favorite.deleteOne(favoriteQuery);


      // Remove bookmark from Recombee - only for premium users with 15+ day plans
      try {
        if (process.env.NODE_ENV === 'production') {
          let shouldSyncToRecombee = false;
          
          if (user.isPremiumPlan && user.plan?.planStartDate && user.plan?.planEndDate) {
            const planDuration = new Date(user.plan.planEndDate) - new Date(user.plan.planStartDate);
            const fifteenDaysInMs = 15 * 24 * 60 * 60 * 1000;
            
            if (planDuration >= fifteenDaysInMs) {
              shouldSyncToRecombee = true;
            }
          }
          
          if (shouldSyncToRecombee) {
            const itemId = movieId;
            await recombeeService.deleteBookmark(user._id.toString(), itemId);
          }
        }
      } catch (recombeeError) {
        console.error('Recombee bookmark removal error:', recombeeError?.message);
      }


      // Decrement favorite counter if it's an episode
      if (type === "tv" && episodeId) {
        await Episode.findByIdAndUpdate(episodeId, { $inc: { favorite: -1 } });
      }

      return res.status(200).json({
        status: true,
        message: "Unfavorite done",
        isFavorite: false,
      });
    } else {
      const favorite_ = new Favorite();
      favorite_.userId = user._id;
      favorite_.type = type;

      if (type === "movie") {
        favorite_.movieId = content._id;
        favorite_.episodeId = null;
      } else {
        favorite_.episodeId = content._id;
        favorite_.movieId = content.movie; // Parent series ID
      }

      await favorite_.save();

      // Add bookmark to Recombee - only for premium users with 15+ day plans
      try {
        if (process.env.NODE_ENV === 'production') {
          let shouldSyncToRecombee = false;
          
          if (user.isPremiumPlan && user.plan?.planStartDate && user.plan?.planEndDate) {
            const planDuration = new Date(user.plan.planEndDate) - new Date(user.plan.planStartDate);
            const fifteenDaysInMs = 15 * 24 * 60 * 60 * 1000;
            
            if (planDuration >= fifteenDaysInMs) {
              shouldSyncToRecombee = true;
            }
          }
          
          if (shouldSyncToRecombee) {
            const itemId = movieId;
            await recombeeService.addBookmark(user._id.toString(), itemId);
          }
        }
      } catch (recombeeError) {
        console.error('Recombee bookmark error:', recombeeError?.message);
      }

      // Increment favorite counter if it's an episode
      if (type === "tv" && episodeId) {
        await Episode.findByIdAndUpdate(episodeId, { $inc: { favorite: 1 } });
      }

      return res.status(200).json({
        status: true,
        message: "Favorite done",
        isFavorite: true,
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

//get Favorite List of Movie For Android
//exports.getFavoriteList = async (req, res) => {
//   try {
//     if (!req.query.userId) {
//       return res
//         .status(200)
//         .json({ status: false, message: "User Id is required!!" });
//     }

//     const user = await User.findById(req.query.userId);

//     if (!user) {
//       return res
//         .status(200)
//         .json({ status: false, message: "User does not found!!" });
//     }

//     const favorite = await Favorite.aggregate([
//       {
//         $match: {
//           userId: user._id,
//         },
//       },
//       {
//         $lookup: {
//           from: "movies",
//           as: "movie",
//           localField: "movieId",
//           foreignField: "_id",
//         },
//       },
//       {
//         $unwind: {
//           path: "$movie",
//           preserveNullAndEmptyArrays: false,
//         },
//       },
//       {
//         $project: {
//           movieId: "$movie._id",
//           movieTitle: "$movie.title",
//           movieRating: "$movie.rating",
//           movieImage: "$movie.image",
//         },
//       },
//     ]);

//     if (favorite.length > 0) {
//       return res
//         .status(200)
//         .json({ status: true, message: "Success!!", favorite });
//     } else {
//       return res
//         .status(200)
//         .json({ status: false, message: "No data found!!" });
//     }
//   } catch (error) {
//     return res.status(500).json({
//       status: false,
//       error: error.message || "Internal Server Error!!",
//     });
//   }
//};

exports.getFavoriteList = async (req, res) => {
  try {
    const { page = 1, perPage = 10 } = req.query; // Pagination parameters

    if (!req.user.userId) {
      return res
        .status(200)
        .json({ status: false, message: "User Id is required." });
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

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res
        .status(200)
        .json({ status: false, message: "User does not found." });
    }

    // Build match query for TV favorites only
    const matchQuery = {
      userId: new mongoose.Types.ObjectId(user._id),
      type: "tv"
    };

    // Get TV episode favorites with enhanced lookup
    const tvFavorites = await Favorite.aggregate([
      { $match: matchQuery },
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: "episodes",
          localField: "episodeId",
          foreignField: "_id",
          as: "episode",
        },
      },
      { $unwind: { path: "$episode" } },
      {
        $lookup: {
          from: "movies",
          localField: "movieId", // Parent series
          foreignField: "_id",
          as: "series",
        },
      },
      { $unwind: { path: "$series" } },
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
              },
            },
          ],
        },
      },
      {
        $replaceRoot: {
          newRoot: {
            $mergeObjects: [
              "$episode",
              {
                seriesId: "$series._id",
                seriesTitle: "$series.title",
                seriesImage: "$series.image",
                seriesThumbnail: "$series.thumbnail",
                seriesType: "$series.type",
                seriesYear: "$series.year",
                seriesMediaType: "$series.media_type",
                seriesRegion: "$series.region",
                seriesGenre: "$genreDetails",
                favoriteCreatedAt: "$createdAt",
                newReleased: "$series.newReleased"
              }
            ],
          },
        },
      },
      { $project: { episode: 0, series: 0, genreDetails: 0, runtime: 0 } },
    ]);

    // Apply pagination
    const total = tvFavorites.length;
    const totalPages = Math.ceil(total / paginationQuery.perPage);
    const startIndex = (paginationQuery.page - 1) * paginationQuery.perPage;
    const endIndex = startIndex + paginationQuery.perPage;
    const paginatedFavorites = tvFavorites.slice(startIndex, endIndex);

    if (tvFavorites.length > 0) {
      return res
        .status(200)
        .json({
          status: true,
          message: "Favorites retrieved successfully",
          favorites: paginatedFavorites,
          total,
          page: paginationQuery.page,
          perPage: paginationQuery.perPage,
          totalPages,
          hasNextPage: paginationQuery.page < totalPages,
          hasPrevPage: paginationQuery.page > 1
        });
    } else {
      return res.status(200).json({
        status: true,
        message: "No favorites found.",
        favorites: [],
        total: 0,
        page: paginationQuery.page,
        perPage: paginationQuery.perPage,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false
      });
    }
  } catch (error) {
    console.error("Error retrieving favorites:", error);
    return res
      .status(500)
      .json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//check hero widget favorites for logged-in user
exports.checkHeroWidgetFavorites = async (req, res) => {
  try {
    if (!req.user.userId) {
      return res.status(400).json({ status: false, message: "User Id is required." });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(400).json({ status: false, message: "User does not found." });
    }

    // Get hero widgets (type 1) with low order (1-3) sorted by order
    const heroWidgets = await Widget.find({
      type: 1,
      order: { $lte: 3 },
      isActive: true
    }).sort({ order: 1 });

    if (!heroWidgets.length) {
      return res.status(200).json({ status: true, message: "No hero widgets found.", favorites: [] });
    }

    // Get all series IDs from hero widgets
    const allSeriesIds = [];
    heroWidgets.forEach(widget => {
      if (widget.seriesIds && widget.seriesIds.length > 0) {
        allSeriesIds.push(...widget.seriesIds.map(id => new mongoose.Types.ObjectId(id)));
      }
    });

    if (!allSeriesIds.length) {
      return res.status(200).json({ status: true, message: "No content in hero widgets.", favorites: [] });
    }

    // Get content with favorites check in single aggregation
    const favoriteChecks = await Movie.aggregate([
      { $match: { _id: { $in: allSeriesIds } } },
      {
        $lookup: {
          from: "episodes",
          localField: "_id",
          foreignField: "movie",
          as: "episodes",
          pipeline: [{ $sort: { episodeNumber: 1 } }, { $limit: 1 }]
        }
      },
      {
        $lookup: {
          from: "favorites",
          let: {
            movieId: "$_id",
            episodeId: { $arrayElemAt: ["$episodes._id", 0] },
            contentType: "$type"
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$userId", user._id] },
                    { $eq: ["$type", "tv"] },
                    { $eq: ["$movieId", "$$movieId"] },
                    { $eq: ["$episodeId", "$$episodeId"] }
                  ]
                }
              }
            }
          ],
          as: "favorite"
        }
      },
      {
        $project: {
          movieId: "$_id",
          title: 1,
          type: 1,
          episodeId: { $arrayElemAt: ["$episodes._id", 0] },
          isFavorite: { $gt: [{ $size: "$favorite" }, 0] }
        }
      }
    ]);

    return res.status(200).json({
      status: true,
      message: "Hero widget favorites checked successfully.",
      favorites: favoriteChecks
    });

  } catch (error) {
    console.error("Error checking hero widget favorites:", error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};
