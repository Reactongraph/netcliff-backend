const Analytics = require("./analytics.model");
const Movie = require("../movie/movie.model");
const User = require("../user/user.model");
const PremiumPlanHistory = require("../premiumPlan/premiumPlanHistory.model");
const PremiumPlan = require("../premiumPlan/premiumPlan.model");
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

// Get top performing content (mirrors summary.topContent, but as a separate endpoint)
exports.getTopContent = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const query = {};
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) {
        const d = new Date(endDate);
        d.setHours(23, 59, 59, 999);
        query.date.$lte = d;
      }
    }

    const topContent = await Analytics.aggregate([
      {
        $match: {
          ...query,
          eventType: { $in: ["thumbnail_view", "thumbnail_click"] },
          movieId: { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: "$movieId",
          thumbnailViews: {
            $sum: {
              $cond: [{ $eq: ["$eventType", "thumbnail_view"] }, "$count", 0],
            },
          },
          thumbnailClicks: {
            $sum: {
              $cond: [{ $eq: ["$eventType", "thumbnail_click"] }, "$count", 0],
            },
          },
        },
      },
      {
        $lookup: {
          from: "movies",
          localField: "_id",
          foreignField: "_id",
          as: "content",
        },
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
              {
                $multiply: [
                  { $divide: ["$thumbnailClicks", "$thumbnailViews"] },
                  100,
                ],
              },
            ],
          },
        },
      },
      { $sort: { thumbnailViews: -1 } },
      { $limit: 10 },
    ]);

    return res.status(200).json({
      status: true,
      message: "Top content retrieved successfully",
      data: { topContent },
    });
  } catch (error) {
    console.error("Error retrieving top content:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Movie-specific analytics: daily views/clicks for one content item
exports.getMovieAnalytics = async (req, res) => {
  try {
    const { movieId } = req.params;
    const { startDate, endDate } = req.query;

    if (!movieId) {
      return res.status(400).json({ status: false, message: "movieId is required" });
    }

    const content = await Movie.findById(movieId).select("_id").lean();
    if (!content) {
      return res.status(404).json({ status: false, message: "Movie not found" });
    }

    const query = { movieId: mongoose.Types.ObjectId(movieId), eventType: { $in: ["thumbnail_view", "thumbnail_click"] } };
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) {
        const d = new Date(endDate);
        d.setHours(23, 59, 59, 999);
        query.date.$lte = d;
      }
    }

    const dailyTrends = await Analytics.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            eventType: "$eventType",
            date: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
          },
          count: { $sum: "$count" },
        },
      },
      {
        $project: {
          _id: 0,
          eventType: "$_id.eventType",
          date: "$_id.date",
          count: 1,
        },
      },
      { $sort: { date: 1, eventType: 1 } },
    ]);

    return res.status(200).json({
      status: true,
      message: "Movie analytics retrieved successfully",
      data: { dailyTrends },
    });
  } catch (error) {
    console.error("Error retrieving movie analytics:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get subscribed users list (simple list for admin)
exports.getSubscribedUsers = async (req, res) => {
  try {
    const users = await User.find({ isPremiumPlan: true })
      .select("fullName email country plan createdAt")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      status: true,
      message: "Subscribed users retrieved successfully",
      data: users,
    });
  } catch (error) {
    console.error("Error retrieving subscribed users:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get users subscription analytics (country, createdAt, planType, planStatus, subscriptionTimeRemaining)
exports.getUsersSubscriptionAnalytics = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limitRaw = parseInt(req.query.limit, 10) || 50;
    const limit = Math.min(Math.max(limitRaw, 1), 100);

    const [users, total] = await Promise.all([
      User.find({})
        .populate("plan.premiumPlanId", "name tag")
        .select("fullName country createdAt isPremiumPlan plan")
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments({}),
    ]);

    const now = new Date();
    const data = users.map((user) => {
      const subscriptionExpiry =
        user.plan && user.plan.planEndDate ? new Date(user.plan.planEndDate) : null;
      const isPremium =
        !!user.isPremiumPlan &&
        subscriptionExpiry &&
        subscriptionExpiry.getTime() > now.getTime();
      const planStatus = isPremium ? "premium" : "free";

      const premium = user.plan && user.plan.premiumPlanId;
      const planType =
        premium && (premium.name || premium.tag) ? premium.name || premium.tag : null;

      const item = {
        name: user.fullName ?? null,
        country: user.country ?? null,
        createdAt: user.createdAt ?? null,
        planType,
        planStatus,
      };

      if (planStatus === "premium" && subscriptionExpiry) {
        const diffMs = subscriptionExpiry.getTime() - now.getTime();
        item.subscriptionTimeRemaining = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
      }

      return item;
    });

    return res.status(200).json({
      status: true,
      message: "Users subscription analytics retrieved successfully",
      data,
      total,
      page,
      limit,
      hasNextPage: page * limit < total,
    });
  } catch (error) {
    console.error("Error retrieving users subscription analytics:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get subscriptions analytics from premium plan history (acts like transactions)
exports.getSubscriptionsAnalytics = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limitRaw = parseInt(req.query.limit, 10) || 50;
    const limit = Math.min(Math.max(limitRaw, 1), 100);

    const [histories, total] = await Promise.all([
      PremiumPlanHistory.find({})
        .populate("userId", "email country")
        .populate("premiumPlanId", "name tag")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      PremiumPlanHistory.countDocuments({}),
    ]);

    const data = histories.map((h) => ({
      country: h.userId?.country ?? null,
      createdAt: h.createdAt ?? null,
      planType:
        h.premiumPlanId && (h.premiumPlanId.name || h.premiumPlanId.tag)
          ? h.premiumPlanId.name || h.premiumPlanId.tag
          : null,
      status: h.status ?? null,
      amount_total: h.amount ?? null,
      currency: h.currency ?? null,
      flow: h.paymentGateway ?? null,
      email: h.userId?.email ?? null,
    }));

    return res.status(200).json({
      status: true,
      message: "Subscriptions analytics retrieved successfully",
      data,
      total,
      page,
      limit,
      hasNextPage: page * limit < total,
    });
  } catch (error) {
    console.error("Error retrieving subscriptions analytics:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get incomplete payments analytics (approximated from PremiumPlanHistory)
exports.getIncompletePayments = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const dateQuery = {};
    if (startDate || endDate) {
      if (startDate) dateQuery.$gte = new Date(startDate);
      if (endDate) {
        const d = new Date(endDate);
        d.setHours(23, 59, 59, 999);
        dateQuery.$lte = d;
      }
    }

    const matchFilter =
      Object.keys(dateQuery).length > 0 ? { createdAt: dateQuery } : {};

    const incomplete = await PremiumPlanHistory.find({
      ...matchFilter,
      status: { $in: ["pending", "failed"] },
    })
      .populate("userId", "email country")
      .populate("premiumPlanId", "name tag")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    const data = incomplete.map((h) => ({
      createdAt: h.createdAt ?? null,
      email: h.userId?.email ?? null,
      country: h.userId?.country ?? null,
      planType:
        h.premiumPlanId && (h.premiumPlanId.name || h.premiumPlanId.tag)
          ? h.premiumPlanId.name || h.premiumPlanId.tag
          : null,
      status: h.status ?? null,
      amount_total: h.amount ?? null,
      currency: h.currency ?? null,
      flow: h.paymentGateway ?? null,
    }));

    return res.status(200).json({
      status: true,
      message: "Incomplete payments retrieved successfully",
      data,
    });
  } catch (error) {
    console.error("Error retrieving incomplete payments:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Registration analytics: total users and country-wise breakdown (for admin panel)
exports.getRegistrationAnalytics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const match = {};

    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) match.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const d = new Date(endDate);
        d.setHours(23, 59, 59, 999);
        match.createdAt.$lte = d;
      }
    }

    const [byCountry, totalUsers] = await Promise.all([
      User.aggregate([
        { $match: match },
        { $group: { _id: { $ifNull: ["$country", "Unknown"] }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      User.countDocuments(match),
    ]);

    const countryBreakdown = byCountry.map((row) => ({
      country: row._id,
      count: row.count,
      percentage: totalUsers > 0 ? (row.count / totalUsers) * 100 : 0,
    }));

    return res.status(200).json({
      status: true,
      message: "Registration analytics retrieved successfully",
      data: { totalUsers, countryBreakdown },
    });
  } catch (error) {
    console.error("Error retrieving registration analytics:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};