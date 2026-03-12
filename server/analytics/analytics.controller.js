const Analytics = require("./analytics.model");
const Movie = require("../movie/movie.model");
const mongoose = require('mongoose');

// Increment analytics counter
exports.incrementCounter = async (req, res) => {
  const { eventType, movieId } = req.body;
  const { userId, role } = req?.user || {}

  try {
    // Validate required fields
    if (!eventType) {
      return res.status(400).json({
        status: false,
        message: "Event type is required"
      });
    }

    // Validate event type
    const validEventTypes = [
      "subscription_plans_view",
      "subscribe_now_click",
      "subscribe_now_click_user",
      "homepage_view",
      "thumbnail_view",
      "thumbnail_click"
    ];

    if (!validEventTypes.includes(eventType)) {
      return res.status(400).json({
        status: false,
        message: "Invalid event type"
      });
    }

    if (eventType === 'subscribe_now_click_user')
      if (!userId)
        return res.status(400).json({
          status: false,
          message: "User ID/logged in  is required for subscribe now to click"
        });


    // Use server UTC date
    const eventDate = new Date();

    // Set time to start of day for consistent daily tracking
    eventDate.setUTCHours(0, 0, 0, 0);

    // Find existing counter or create new one
    const filter = {
      eventType,
      date: eventDate
    };

    if (["thumbnail_view", "thumbnail_click"].includes(eventType) && movieId) {
      filter.movieId = movieId

      // Validate movieId if provided
      const content = await Movie.findById(movieId);
      if (!content) {
        return res.status(404).json({
          status: false,
          message: "Movie not found"
        });
      }
    }

    if (eventType === 'subscribe_now_click_user' && userId)
      filter.userId = userId

    const result = await Analytics.findOneAndUpdate(
      filter,
      { $inc: { count: 1 } },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    );

    return res.status(200).json({
      status: true,
      message: "Counter incremented successfully",
      data: {
        eventType: result.eventType,
        movieId: result.movieId,
        userId: result.userId,
        date: result.date,
        count: result.count
      }
    });

  } catch (error) {
    console.error("Error incrementing analytics counter:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// Bulk increment thumbnail views
exports.bulkIncrementThumbnailViews = async (req, res) => {
  const { movieIds, movieViewCounts } = req.body;

  try {
    // Validate that either movieIds or movieViewCounts is provided
    if (!movieIds && !movieViewCounts) {
      return res.status(400).json({
        status: false,
        message: "Either movieIds array or movieViewCounts array is required"
      });
    }

    // Validate that only one format is provided
    if (movieIds && movieViewCounts) {
      return res.status(400).json({
        status: false,
        message: "Provide either movieIds array OR movieViewCounts array, not both"
      });
    }

    // Use server UTC date
    const eventDate = new Date();
    eventDate.setUTCHours(0, 0, 0, 0);

    // Format 1: Array of movieIds (increment by 1 each) - use updateMany for better performance
    if (movieIds) {
      if (!Array.isArray(movieIds) || movieIds.length === 0) {
        return res.status(400).json({
          status: false,
          message: "movieIds must be a non-empty array"
        });
      }

      // Skip validation and directly update all movieIds
      const bulkOps = movieIds.map(movieId => ({
        updateOne: {
          filter: {
            eventType: "thumbnail_view",
            movieId: mongoose.Types.ObjectId(movieId),
            date: eventDate
          },
          update: { $inc: { count: 1 } },
          upsert: true
        }
      }));

      // Execute bulk operation
      await Analytics.bulkWrite(bulkOps, { ordered: false });

      return res.status(200).json({
        status: true,
        message: `Successfully processed ${movieIds.length} thumbnail views`
      });
    }

    // Format 2: Array of objects with movieId and newViewCount
    if (movieViewCounts) {
      if (!Array.isArray(movieViewCounts) || movieViewCounts.length === 0) {
        return res.status(400).json({
          status: false,
          message: "movieViewCounts must be a non-empty array"
        });
      }

      // Validate each object has required fields
      for (let item of movieViewCounts) {
        if (!item.movieId || typeof item.newViewCount !== 'number' || item.newViewCount <= 0) {
          return res.status(400).json({
            status: false,
            message: "Each item must have movieId and positive newViewCount"
          });
        }
      }

      // Skip movie validation and prepare bulk operations
      const bulkOps = movieViewCounts.map(item => ({
        updateOne: {
          filter: {
            eventType: "thumbnail_view",
            movieId: mongoose.Types.ObjectId(item.movieId),
            date: eventDate
          },
          update: { $inc: { count: item.newViewCount } },
          upsert: true
        }
      }));

      // Execute bulk operation
      await Analytics.bulkWrite(bulkOps, { ordered: false });

      return res.status(200).json({
        status: true,
        message: `Successfully processed ${movieViewCounts.length} thumbnail views`
      });
    }

  } catch (error) {
    console.error("Error bulk incrementing thumbnail views:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// Get analytics counters with date range filtering
exports.getCounters = async (req, res) => {
  try {
    const { eventType, movieId, userId, startDate, endDate } = req.query;

    // Build query
    const query = {};

    if (eventType) {
      query.eventType = eventType;
    }

    if (movieId) {
      query.movieId = movieId;
    }

    if (userId) {
      query.userId = userId;
    }

    // Date range filter
    if (startDate || endDate) {
      query.date = {};
      if (startDate) {
        query.date.$gte = new Date(startDate);
      }
      if (endDate) {
        // Set end date to end of day
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        query.date.$lte = endDateTime;
      }
    }

    // Get daily totals if date range is specified
    // let dailyTotals = [];
    // if (startDate || endDate) {
    //   dailyTotals = await Analytics.aggregate([
    //     { $match: query },
    //     {
    //       $group: {
    //         _id: {
    //           eventType: "$eventType",
    //           date: { $dateToString: { format: "%Y-%m-%d", date: "$date" } }
    //         },
    //         count: { $sum: "$count" }
    //       }
    //     },
    //     {
    //       $project: {
    //         eventType: "$_id.eventType",
    //         date: "$_id.date",
    //         count: 1
    //       }
    //     },
    //     { $sort: { date: -1, eventType: 1 } }
    //   ]);
    // }

    // Get counters data
    const counters = await Analytics.find(query)
      .populate('movieId', 'title')
      .sort({ date: -1, count: -1 });

    return res.status(200).json({
      status: true,
      message: "Analytics counters retrieved successfully",
      data: {
        counters
      }
    });

  } catch (error) {
    console.error("Error retrieving analytics counters:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// Get analytics summary with date range filtering
exports.getAnalyticsSummary = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Build query for date range
    const query = {};
    if (startDate || endDate) {
      query.date = {};
      if (startDate) {
        query.date.$gte = new Date(startDate);
      }
      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        query.date.$lte = endDateTime;
      }
    }

    // Get summary by event type
    const eventTypeSummary = await Analytics.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$eventType",
          totalCount: { $sum: "$count" }
        }
      },
      {
        $project: {
          eventType: "$_id",
          totalCount: 1
        }
      },
      { $sort: { totalCount: -1 } }
    ]);

    // Get top content by thumbnail views and clicks
    const topContent = await Analytics.aggregate([
      {
        $match: {
          ...query,
          eventType: { $in: ["thumbnail_view", "thumbnail_click"] },
          movieId: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: "$movieId",
          thumbnailViews: {
            $sum: {
              $cond: [{ $eq: ["$eventType", "thumbnail_view"] }, "$count", 0]
            }
          },
          thumbnailClicks: {
            $sum: {
              $cond: [{ $eq: ["$eventType", "thumbnail_click"] }, "$count", 0]
            }
          }
        }
      },
      {
        $lookup: {
          from: "movies",
          localField: "_id",
          foreignField: "_id",
          as: "content"
        }
      },
      { $unwind: "$content" },
      {
        $project: {
          movieId: "$_id",
          title: "$content.title",
          thumbnailViews: 1,
          thumbnailClicks: 1,
          clickThroughRate: {
            $cond: [
              { $eq: ["$thumbnailViews", 0] },
              0,
              { $multiply: [{ $divide: ["$thumbnailClicks", "$thumbnailViews"] }, 100] }
            ]
          }
        }
      },
      { $sort: { thumbnailViews: -1 } },
      { $limit: 10 }
    ]);

    // Get daily trends
    const dailyTrends = await Analytics.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            eventType: "$eventType",
            date: { $dateToString: { format: "%Y-%m-%d", date: "$date" } }
          },
          count: { $sum: "$count" }
        }
      },
      {
        $project: {
          eventType: "$_id.eventType",
          date: "$_id.date",
          count: 1
        }
      },
      { $sort: { date: -1, eventType: 1 } }
    ]);

    return res.status(200).json({
      status: true,
      message: "Analytics summary retrieved successfully",
      data: {
        eventTypeSummary,
        topContent,
        dailyTrends
      }
    });

  } catch (error) {
    console.error("Error retrieving analytics summary:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error.message
    });
  }
}; 