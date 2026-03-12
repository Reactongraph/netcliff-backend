const Like = require("./like.model");

//import model
const User = require("../user/user.model");
const Movie = require("../movie/movie.model");
const Episode = require("../episode/episode.model");
const mongoose = require("mongoose");
const { populateGenre, populateLanguage, populateRegion } = require("../movie/movie.aggregations");

//create Like [Only User can do like]
exports.likeAndUnlike = async (req, res) => {
  try {
    const { movieId, episodeId, type } = req.body;
    
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
    let likeQuery = { userId: user._id, type };

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
      
      likeQuery.movieId = content._id;
      likeQuery.episodeId = null;
      
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
      
      likeQuery.episodeId = content._id;
      likeQuery.movieId = content.movie; // Store parent series ID
      
    } else {
      return res
        .status(200)
        .json({ status: false, message: "Invalid type. Must be 'movie' or 'tv'." });
    }

    const like = await Like.findOne(likeQuery);

    //unlike and like
    if (like) {
      await Like.deleteOne(likeQuery);

      // Decrement like counter if it's an episode
      if (type === "tv" && episodeId) {
        await Episode.findByIdAndUpdate(episodeId, { $inc: { like: -1 } });
      }

      return res.status(200).json({
          status: true,
        message: "Unlike done",
          isLike: false,
        });
      } else {
      const like_ = new Like();
      like_.userId = user._id;
      like_.type = type;
      
      if (type === "movie") {
        like_.movieId = content._id;
        like_.episodeId = null;
      } else {
        like_.episodeId = content._id;
        like_.movieId = content.movie; // Parent series ID
      }

      await like_.save();

      // Increment like counter if it's an episode
      if (type === "tv" && episodeId) {
        await Episode.findByIdAndUpdate(episodeId, { $inc: { like: 1 } });
      }

      return res.status(200).json({
        status: true,
        message: "Like done",
        isLike: true,
      });
    }
  } catch (error) {
    console.log('like and unlike error:' ,error?.message);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

//get Like List of Movie For Android
exports.getLikeList = async (req, res) => {
  try {
    const { type } = req.query; // Optional filter by type: "movie" or "tv"
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

    // Build match query
    const matchQuery = { userId: new mongoose.Types.ObjectId(user._id) };
    if (type && ["movie", "tv"].includes(type)) {
      matchQuery.type = type;
    }

    // Get movie likes
    const movieLikes = await Like.aggregate([
      { $match: { ...matchQuery, type: "movie" } },
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: "movies",
          localField: "movieId",
          foreignField: "_id",
          as: "movie",
        },
      },
      { $unwind: { path: "$movie" } },
      {
        $replaceRoot: {
          newRoot: {
            $mergeObjects: ["$movie", "$$ROOT"],
          },
        },
      },
      { $project: { movie: 0 } },
      ...populateGenre,
      ...populateLanguage,
      ...populateRegion,
    ]);

    // Get TV episode likes
    const tvLikes = await Like.aggregate([
      { $match: { ...matchQuery, type: "tv" } },
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
        $replaceRoot: {
          newRoot: {
            $mergeObjects: [
              "$episode",
              {
                seriesTitle: "$series.title",
                seriesImage: "$series.image",
                seriesThumbnail: "$series.thumbnail",
                seriesType: "$series.type",
                seriesYear: "$series.year",
                seriesMediaType: "$series.media_type",
                seriesGenre: "$series.genre",
                seriesLanguage: "$series.language",
                seriesRegion: "$series.region",
                likeType: "tv",
                likeCreatedAt: "$createdAt"
              }
            ],
          },
        },
      },
      { $project: { episode: 0, series: 0 } },
    ]);

    // Combine and sort all likes by creation date
    const allLikes = [...movieLikes, ...tvLikes]
      .sort((a, b) => new Date(b.likeCreatedAt || b.createdAt) - new Date(a.likeCreatedAt || a.createdAt));

    // Apply pagination
    const total = allLikes.length;
    const totalPages = Math.ceil(total / paginationQuery.perPage);
    const startIndex = (paginationQuery.page - 1) * paginationQuery.perPage;
    const endIndex = startIndex + paginationQuery.perPage;
    const paginatedLikes = allLikes.slice(startIndex, endIndex);

    if (allLikes.length > 0) {
      return res
        .status(200)
        .json({ 
          status: true, 
          message: "Success", 
          like: paginatedLikes,
          pagination: {
            page: paginationQuery.page,
            perPage: paginationQuery.perPage,
            totalPages: totalPages,
            hasNextPage: paginationQuery.page < totalPages,
            hasPrevPage: paginationQuery.page > 1
          }
        });
    } else {
      return res.status(200).json({ 
        status: false, 
        message: "No data found.",
        like: [],
        pagination: {
          page: paginationQuery.page,
          perPage: paginationQuery.perPage,
          totalPages: 0,
          hasNextPage: false,
          hasPrevPage: false
        }
      });
    }
  } catch (error) {
    return res
      .status(500)
      .json({ status: false, error: error.message || "Internal Server Error" });
  }
};