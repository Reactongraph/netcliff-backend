const recombeeService = require('../services/recombee.service');
const Movie = require('../movie/movie.model');
const User = require('../user/user.model');
const { generateHlsSignedUrls } = require('../movie/movie.controller');
const { getFromCache, setCache } = require('../../util/redisUtils');

function orderByIdList(items, ids) {
  const indexById = new Map(ids.map((id, i) => [String(id), i]));
  return items
    .slice()
    .sort((a, b) => (indexById.get(String(a._id)) ?? 1e9) - (indexById.get(String(b._id)) ?? 1e9));
}

// Shared aggregation pipeline for fetching movies with episodes
function getRecommendedMovieAggregationPipeline(ids, projectFor = "default") {
  return [
    {
      $match: {
        _id: { $in: ids.map(id => new require("mongoose").Types.ObjectId(id)) },
        status: "PUBLISHED"
      }
    },
    {
      $lookup: {
        from: "episodes",
        let: { movieId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$$movieId", "$movie"] },
                  { $eq: ["$seasonNumber", 1] },
                  { $eq: ["$status", "PUBLISHED"] },
                  { $in: ["$episodeNumber", [1, 2]] }
                ]
              }
            }
          },
          { $sort: { episodeNumber: 1 } }
        ],
        as: "episodes"
      }
    },
    {
      $addFields: {
        firstEpisode: { $arrayElemAt: ["$episodes", 0] },
        secondEpisode: { $arrayElemAt: ["$episodes", 1] }
      }
    },
    {
      $lookup: {
        from: "genres",
        localField: "genre",
        foreignField: "_id",
        as: "genreDetails"
      }
    },
    {
      $project: projectFor === "popular-search" ? {
        _id: 1,
        title: 1,
        description: 1,
        image: 1,
        thumbnail: 1,
        media_type: 1,
        genres: 1,
        view: 1,
        "firstEpisode._id": 1,
        "firstEpisode.drmEnabled": 1,
        "firstEpisode.episodeNumber": 1,
        "firstEpisode.seasonNumber": 1,
        "firstEpisode.hlsFileName": 1,
        "secondEpisode._id": 1,
        "secondEpisode.drmEnabled": 1,
        "secondEpisode.episodeNumber": 1,
        "secondEpisode.seasonNumber": 1,
        "secondEpisode.hlsFileName": 1,
        "firstEpisodeWatchDetails": 1,
        "secondEpisodeWatchDetails": 1
      } : {
        episodes: 0,
        runtime: 0,
        'firstEpisode.runtime': 0,
        'secondEpisode.runtime': 0,
        badges: 0,
        isCronBadge: 0,
        'genreDetails.createdAt': 0,
        'genreDetails.updatedAt': 0
      }
    }
  ];
}

// Shared function to enrich series with watch details
async function enrichSeriesWithWatchDetails(series) {
  return Promise.all(series.map(async (seriesItem) => {
    const episodePromises = [];

    // Process first episode
    if (seriesItem.firstEpisode?.hlsFileName) {
      episodePromises.push(
        (async () => {
          try {
            const cacheKey = `hls:${seriesItem.firstEpisode.hlsFileName}:${seriesItem.firstEpisode.drmEnabled ? 'drm' : 'nodrm'}`;
            let watchDetails = await getFromCache(cacheKey);

            if (!watchDetails) {
              watchDetails = await generateHlsSignedUrls(
                seriesItem.firstEpisode.hlsFileName,
                seriesItem.firstEpisode.drmEnabled || false
              );
              await setCache(cacheKey, watchDetails, process.env.REDIS_TTL);
            }
            return { type: 'first', data: watchDetails };
          } catch (error) {
            console.error('Error processing first episode:', error);
            return { type: 'first', data: null, error: error.message };
          }
        })()
      );
    }

    // Process second episode
    if (seriesItem.secondEpisode?.hlsFileName) {
      episodePromises.push(
        (async () => {
          try {
            const cacheKey = `hls:${seriesItem.secondEpisode.hlsFileName}:${seriesItem.secondEpisode.drmEnabled ? 'drm' : 'nodrm'}`;
            let watchDetails = await getFromCache(cacheKey);

            if (!watchDetails) {
              watchDetails = await generateHlsSignedUrls(
                seriesItem.secondEpisode.hlsFileName,
                seriesItem.secondEpisode.drmEnabled || false
              );
              await setCache(cacheKey, watchDetails, process.env.REDIS_TTL);
            }
            return { type: 'second', data: watchDetails };
          } catch (error) {
            console.error('Error processing second episode:', error);
            return { type: 'second', data: null, error: error.message };
          }
        })()
      );
    }

    // Process episodes in parallel
    const results = await Promise.allSettled(episodePromises);

    let firstEpisodeWatchDetails = null;
    let secondEpisodeWatchDetails = null;

    results.forEach(result => {
      if (result.status === 'fulfilled') {
        if (result.value.type === 'first') {
          firstEpisodeWatchDetails = result.value.data;
          if (result.value.error) {
            firstEpisodeWatchDetails = { ...firstEpisodeWatchDetails, error: result.value.error };
          }
        } else if (result.value.type === 'second') {
          secondEpisodeWatchDetails = result.value.data;
          if (result.value.error) {
            secondEpisodeWatchDetails = { ...secondEpisodeWatchDetails, error: result.value.error };
          }
        }
      } else {
        console.error('Promise rejected:', result.reason);
        if (result.value?.type === 'first') {
          firstEpisodeWatchDetails = { error: result.reason };
        } else if (result.value?.type === 'second') {
          secondEpisodeWatchDetails = { error: result.reason };
        }
      }
    });

    return {
      ...seriesItem,
      firstEpisodeWatchDetails,
      secondEpisodeWatchDetails
    };
  }));
}

// Get cached popular items or fetch from Recombee
async function getCachedPopularItems(userId, count) {
  const cacheKey = `recombee:popular:${count}`;

  try {
    // Try to get from cache first
    let popularItems = await getFromCache(cacheKey);

    if (!popularItems) {
      // Default user id for popular items, as this popular api part mainly hit when user is not on recombee/ not premium.
      const popularResult = await recombeeService.getPopularItems('6876344a728d67197a255b66', count);

      if (popularResult.success && popularResult.data?.recomms?.length) {
        popularItems = {
          ids: popularResult.data.recomms.map(x => x.id),
          recommId: popularResult.data.recommId
        };

        // Cache for 24 hours (86400 seconds)
        await setCache(cacheKey, popularItems, 86400);
      }
    }

    return popularItems;
  } catch (error) {
    console.error('Error getting cached popular items:', error);
    return null;
  }
}

// Shared function to get recommendations with fallback
async function getRecommendationsWithFallback(userId, count, skipRecombee = false, paginationQuery = null, baseRecommId = null) {
  // For page > 1, use RecommendNextItems if we have a recommId
  if (paginationQuery?.page > 1 && baseRecommId) {
    try {
      const result = await recombeeService.getNextRecommendations(baseRecommId, count);
      if (result.success && result.data?.recomms?.length) {
        return {
          success: true,
          ids: result.data.recomms.map(x => x.id),
          recommId: result.data.recommId,
          fallback: false
        };
      }
    } catch (error) {
      console.error('Recombee next recommendations error:', error);
    }
  }

  // For page 1 or if next items failed, get fresh recommendations
  if (!skipRecombee) {
    try {
      const result = await recombeeService.getRecommendations(userId, count);
      if (result.success && result.data?.recomms?.length) {
        return {
          success: true,
          ids: result.data.recomms.map(x => x.id),
          recommId: result.data.recommId,
          fallback: false
        };
      }
    } catch (error) {
      console.error('Recombee personalized recommendations error:', error);
    }
  }

  // Try cached popular items fallback
  const popularItems = await getCachedPopularItems(userId, count);
  if (popularItems?.ids?.length) {
    return {
      success: true,
      ids: popularItems.ids,
      recommId: popularItems.recommId,
      fallback: true,
      fallbackType: 'recombee_popular'
    };
  }

  // Final database fallback
  const fallbackMovies = await Movie.find({ status: 'PUBLISHED' })
    .sort({ view: -1 })
    .limit(count)
    .populate('genre')
    .select({ badges: 0, isCronBadge: 0 })
    .lean();

  return {
    success: true,
    ids: fallbackMovies.map(m => m._id.toString()),
    movies: fallbackMovies,
    fallback: true,
    fallbackType: 'database_popular'
  };
}

// Get personalized recommendations for user
exports.getUserRecommendations = async (req, res) => {
  try {
    const userId = req?.user?.userId;
    const { page = 1, perPage = 10, recommId: baseRecommId } = req.query;

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

    const count = paginationQuery.perPage;

    // Check if user is eligible for personalized recommendations
    let skipRecombee = false;
    const user = req.user;

    if (user?.isPremiumPlan !== true) {
      console.log(`User ${userId} not eligible for personalized recommendations - not premium`);
      skipRecombee = true;
    }

    // Get recommendations with fallback logic
    const recommendationResult = await getRecommendationsWithFallback(userId, count, skipRecombee, paginationQuery, baseRecommId);

    // For Recombee results, fetch and enrich movies
    const pipeline = getRecommendedMovieAggregationPipeline(recommendationResult.ids, 'default');
    const movies = await Movie.aggregate(pipeline);
    const ordered = orderByIdList(movies, recommendationResult.ids);
    const enrichedSeries = await enrichSeriesWithWatchDetails(ordered);

    return res.status(200).json({
      status: true,
      message: "User recommendations fetched successfully.",
      recommId: recommendationResult.recommId,
      ...(recommendationResult.fallback && {
        fallback: true,
        fallbackType: recommendationResult.fallbackType
      }),
      series: enrichedSeries,
      page: paginationQuery.page,
      perPage: paginationQuery.perPage
    });
  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ status: false, message: error.message || 'Internal Server Error' });
  }
};

// Get similar movies
exports.getSimilarMovies = async (req, res) => {
  try {
    const { movieId } = req.params;
    const count = Math.min(parseInt(req.query.count || '10', 10), 20);

    const result = await recombeeService.getSimilarMovies(movieId, count);

    if (!result.success) {
      return res.status(400).json({ status: false, message: result.error });
    }

    const ids = (result.data?.recomms || []).map(x => x.id);
    const movies = await Movie.find({ _id: { $in: ids } }).lean();
    const ordered = orderByIdList(movies, ids);

    res.json({
      status: true,
      recommId: result.data.recommId,
      items: ordered,
      ids
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Track user interaction
exports.trackInteraction = async (req, res) => {
  try {
    const { userId, movieId } = req.params;
    const { type = 'view', rating, timestamp } = req.body;

    const result = await recombeeService.addInteraction(userId, movieId, type, rating, timestamp);

    if (!result.success) {
      return res.status(400).json({ status: false, message: result.error });
    }

    res.json({ status: true, message: 'Interaction tracked successfully' });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Get user recommendations for admin panel
exports.getAdminUserRecommendations = async (req, res) => {
  try {
    const { searchText, count = 10 } = req.body;

    if (!searchText) {
      return res.status(400).json({
        status: false,
        message: 'Please provide searchText (userId, phoneNumber, or email)'
      });
    }

    // Find user by searchText - try _id first, then email, then phoneNumber
    let user;

    // Try to find by _id first
    if (searchText.match(/^[0-9a-fA-F]{24}$/)) {
      user = await User.findById(searchText);
    }

    // If not found, try email
    if (!user && searchText.includes('@')) {
      user = await User.findOne({ email: searchText });
    }

    // If still not found, try phone number
    if (!user) {
      user = await User.findOne({ phoneNumber: searchText });
    }

    if (!user) {
      return res.status(404).json({
        status: false,
        message: 'User not found'
      });
    }

    // Get recommendations with fallback logic
    const recommendationResult = await getRecommendationsWithFallback(user._id.toString(), parseInt(count));

    if (!recommendationResult.ids.length) {
      return res.json({
        status: true,
        message: 'No recommendations found',
        user: {
          _id: user._id,
          email: user.email,
          phoneNumber: user.phoneNumber,
          fullName: user.fullName
        },
        searchText,
        recommendations: [],
        fallback: true
      });
    }

    // For admin, we use simpler movie fetch with populate (no episodes/watch details needed)
    let movies;
    if (recommendationResult.fallbackType === 'database_popular') {
      movies = recommendationResult.movies;
    } else {
      movies = await Movie.find({ _id: { $in: recommendationResult.ids } })
        .populate('genre', 'name')
        .populate('region', 'name')
        .lean();
    }

    const orderedMovies = orderByIdList(movies, recommendationResult.ids);

    return res.json({
      status: true,
      message: 'Recommendations retrieved successfully',
      user: {
        _id: user._id,
        email: user.email,
        phoneNumber: user.phoneNumber,
        fullName: user.fullName
      },
      searchText,
      recommendations: orderedMovies,
      ...(recommendationResult.recommId && { recommId: recommendationResult.recommId }),
      ...(recommendationResult.fallback && {
        fallback: true,
        fallbackType: recommendationResult.fallbackType
      }),
      totalRecommendations: orderedMovies.length
    });

  } catch (error) {
    console.error('Admin recommendation error:', error);
    return res.status(500).json({
      status: false,
      message: error.message || 'Internal server error'
    });
  }
};

// Get popular recommendations for search page
exports.getPopularRecommendations = async (req, res) => {
  try {
    const { perPage = 20 } = req.query;
    const count = parseInt(perPage) || 20;

    // Get popular items (uses internal cache/recombee)
    // pass a dummy userId as the helper expects one (though recombee helper uses it)
    const popularResult = await getCachedPopularItems('popular_global_fetch', count);

    let ids = popularResult?.ids || [];
    let isFallback = false;

    if (!ids.length) {
      // Final database fallback
      const fallbackMovies = await Movie.find({ status: 'PUBLISHED' })
        .sort({ view: -1 })
        .limit(count)
        .select('_id')
        .lean();

      ids = fallbackMovies.map(m => m._id.toString());
      isFallback = true;
    }

    // Fetch and enrich movies
    const pipeline = getRecommendedMovieAggregationPipeline(ids, 'popular-search');
    const movies = await Movie.aggregate(pipeline);
    const ordered = orderByIdList(movies, ids);
    const enrichedSeries = await enrichSeriesWithWatchDetails(ordered);

    return res.status(200).json({
      status: true,
      message: "Popular recommendations fetched successfully.",
      recommId: popularResult?.recommId,
      fallback: isFallback,
      series: enrichedSeries,
      perPage: count
    });
  } catch (error) {
    console.error('Popular recommendations error:', error);
    return res.status(500).json({ status: false, message: error.message || 'Internal Server Error' });
  }
};