const Analytics = require("./analytics.model");
const Movie = require("../movie/movie.model");
const User = require("../user/user.model");
const PremiumPlanHistory = require("../premiumPlan/premiumPlanHistory.model");
const PremiumPlan = require("../premiumPlan/premiumPlan.model");
const mongoose = require('mongoose');
const ExportHistory = require("./exportHistory.model");
const { containerClient, containerName } = require("../../util/azureServices");
const { sendEmail } = require("../../util/email");
const { generateCdnUrl } = require("../../util/cdnHelper");
const {
  buildDateFilters,
  buildIncompletePaymentsQuery,
  fetchTableDataForExport,
  buildCsvContent,
  buildPdfBuffer,
  buildExportEmailHtml,
  getTableTitle,
  APPLY_FILTERS_TO_EXPORT,
} = require("./analyticsExportHelpers");

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

    const eventTypeSummary = await Analytics.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$eventType",
          totalCount: { $sum: "$count" },
        },
      },
      {
        $project: {
          eventType: "$_id",
          totalCount: 1,
        },
      },
      { $sort: { totalCount: -1 } },
    ]);

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
          eventType: "$_id.eventType",
          date: "$_id.date",
          count: 1,
        },
      },
      { $sort: { date: -1, eventType: 1 } },
      { $limit: 365 },
    ]);

    return res.status(200).json({
      status: true,
      message: "Analytics summary retrieved successfully",
      data: {
        eventTypeSummary,
        topContent,
        dailyTrends,
      },
    });
  } catch (error) {
    console.error("Error retrieving analytics summary:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get top performing content (separate endpoint, mirroring nabtt)
exports.getTopContent = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

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

    const results = await Analytics.aggregate([
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
      { $sort: { thumbnailViews: -1, movieId: -1 } },
      { $limit: 1000 },
    ]);

    return res.status(200).json({
      status: true,
      message: "Top content retrieved successfully",
      data: {
        topContent: results,
      },
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

// Get analytics for a specific movie (daily trends + summary)
exports.getMovieAnalytics = async (req, res) => {
  try {
    const { movieId } = req.params;
    const { startDate, endDate } = req.query;

    if (!movieId) {
      return res.status(400).json({
        status: false,
        message: "Movie ID is required",
      });
    }

    const query = { movieId: mongoose.Types.ObjectId(movieId) };
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
          eventType: "$_id.eventType",
          date: "$_id.date",
          count: 1,
        },
      },
      { $sort: { date: 1, eventType: 1 } },
    ]);

    const summary = await Analytics.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$eventType",
          totalCount: { $sum: "$count" },
        },
      },
      {
        $project: {
          eventType: "$_id",
          totalCount: 1,
        },
      },
    ]);

    return res.status(200).json({
      status: true,
      message: "Movie analytics retrieved successfully",
      data: {
        dailyTrends,
        summary,
      },
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

// Get subscribed users (planEndDate >= now, similar to nabtt subscriptionExpiry)
exports.getSubscribedUsers = async (req, res) => {
  try {
    const now = new Date();
    const users = await User.find({
      "plan.status": "active",
      "plan.planEndDate": { $gte: now },
    })
      .populate("plan.premiumPlanId", "name tag")
      .select("email fullName country plan planEndDate createdAt")
      .sort({ "plan.planEndDate": 1 })
      .lean();

    const data = users.map((user) => {
      const premium = user.plan && user.plan.premiumPlanId;
      const planType =
        premium && (premium.name || premium.tag) ? premium.name || premium.tag : null;

      return {
        email: user.email || null,
        fullName: user.fullName || null,
        country: user.country || null,
        planType,
        subscriptionExpiry: (user.plan && user.plan.planEndDate) || null,
        createdAt: user.createdAt || null,
      };
    });

    return res.status(200).json({
      status: true,
      message: "Subscribed users retrieved successfully",
      data,
      total: data.length,
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
    const limit = 1000;
    const query = {};

    const [users, total] = await Promise.all([
      User.find(query)
        .populate("plan.premiumPlanId", "name tag")
        .select("fullName email country createdAt isPremiumPlan plan")
        .limit(limit)
        .lean(),
      User.countDocuments(query),
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
        fullName: user.fullName ?? null,
        email: user.email ?? null,
        country: user.country ?? null,
        createdAt: user.createdAt ?? null,
        planType,
        planStatus,
      };

      if (planStatus === "premium" && subscriptionExpiry) {
        const diffMs = subscriptionExpiry.getTime() - now.getTime();
        const daysRemaining = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
        item.subscriptionTimeRemaining = daysRemaining;
      }

      return item;
    });

    return res.status(200).json({
      status: true,
      message: "Users subscription analytics retrieved successfully",
      data,
      total,
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

// Get subscriptions table data - paginated, fast, supports searchKey + searchValue
exports.getSubscriptionsAnalytics = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 25,
      searchKey,
      searchValue,
      startDate,
      endDate,
      countries,
      planTypes,
      statuses,
      emailSearch,
      amount,
      amountMin,
      amountMax,
      sortKey,
      sortOrder,
    } = req.query;
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 100);
    const skip = (pageNum - 1) * limitNum;

    const { matchFilter } = buildDateFilters(startDate, endDate);
    const match = { ...matchFilter };

    const searchVal = typeof searchValue === "string" && searchValue.trim() ? searchValue.trim() : "";
    const key = typeof searchKey === "string" && searchKey.trim() ? searchKey.trim().toLowerCase() : "";

    const countryArr = Array.isArray(countries) ? countries : typeof countries === "string" && countries ? countries.split(",").map((c) => c.trim()).filter(Boolean) : [];
    const planTypeArr = Array.isArray(planTypes) ? planTypes : typeof planTypes === "string" && planTypes ? planTypes.split(",").map((p) => p.trim()).filter(Boolean) : [];
    const statusArr = Array.isArray(statuses) ? statuses : typeof statuses === "string" && statuses ? statuses.split(",").map((s) => s.trim()).filter(Boolean) : [];
    const emailSearchVal = typeof emailSearch === "string" && emailSearch.trim() ? emailSearch.trim() : "";

    let userIdFilter = null;
    if (countryArr.length) {
      const countryQuery = countryArr.includes("Unknown")
        ? { $or: [{ country: { $in: countryArr } }, { country: null }, { country: "" }] }
        : { country: { $in: countryArr } };
      const users = await User.find(countryQuery).select("_id");
      userIdFilter = users.map((u) => u._id);
    }
    if (emailSearchVal) {
      const users = await User.find({ email: { $regex: emailSearchVal, $options: "i" } }).select("_id");
      const ids = users.map((u) => u._id);
      userIdFilter = userIdFilter ? userIdFilter.filter((id) => ids.some((i) => i.equals(id))) : ids;
    }
    if (userIdFilter && userIdFilter.length > 0) {
      match.userId = { $in: userIdFilter };
    }

    if (planTypeArr.length) {
      const plans = await PremiumPlan.find({
        $or: [{ name: { $in: planTypeArr } }, { tag: { $in: planTypeArr } }],
      }).select("_id");
      match.premiumPlanId = { $in: plans.map((p) => p._id) };
    }
    if (statusArr.length) {
      match.status = { $in: statusArr };
    }

    const amtEqual = amount != null && amount !== "" ? Number(amount) : null;
    const amtMin = amountMin != null && amountMin !== "" ? Number(amountMin) : null;
    const amtMax = amountMax != null && amountMax !== "" ? Number(amountMax) : null;
    if (amtEqual != null && !Number.isNaN(amtEqual)) {
      match.amount = amtEqual;
    } else if ((amtMin != null && !Number.isNaN(amtMin)) || (amtMax != null && !Number.isNaN(amtMax))) {
      match.amount = {};
      if (amtMin != null && !Number.isNaN(amtMin)) match.amount.$gte = amtMin;
      if (amtMax != null && !Number.isNaN(amtMax)) match.amount.$lte = amtMax;
    }

    if (searchVal) {
      if (key === "email") {
        const users = await User.find({ email: { $regex: searchVal, $options: "i" } }).select("_id");
        const ids = users.map((u) => u._id);
        match.userId = userIdFilter ? { $in: ids.filter((id) => userIdFilter.some((i) => i.equals(id))) } : { $in: ids };
      } else if (key === "country") {
        const users = await User.find({ country: { $regex: searchVal, $options: "i" } }).select("_id");
        const ids = users.map((u) => u._id);
        match.userId = userIdFilter ? { $in: ids.filter((id) => userIdFilter.some((i) => i.equals(id))) } : { $in: ids };
      } else if (key === "plantype" || key === "plan") {
        const plans = await PremiumPlan.find({
          $or: [
            { name: { $regex: searchVal, $options: "i" } },
            { tag: { $regex: searchVal, $options: "i" } },
          ],
        }).select("_id");
        const planIds = plans.map((p) => p._id);
        if (planTypeArr.length && match.premiumPlanId?.$in) {
          const existing = match.premiumPlanId.$in;
          match.premiumPlanId = { $in: planIds.filter((id) => existing.some((i) => i.equals(id))) };
        } else {
          match.premiumPlanId = { $in: planIds };
        }
      } else if (key === "status") {
        match.status = statusArr.length
          ? { $in: statusArr.filter((s) => new RegExp(searchVal, "i").test(s)) }
          : { $regex: searchVal, $options: "i" };
      } else if (key === "transactionid" || key === "transaction") {
        match.transactionId = { $regex: searchVal, $options: "i" };
      } else {
        const users = await User.find({
          $or: [
            { email: { $regex: searchVal, $options: "i" } },
            { country: { $regex: searchVal, $options: "i" } },
          ],
        }).select("_id");
        const plans = await PremiumPlan.find({
          $or: [
            { name: { $regex: searchVal, $options: "i" } },
            { tag: { $regex: searchVal, $options: "i" } },
          ],
        }).select("_id");
        const searchOr = [
          { userId: { $in: users.map((u) => u._id) } },
          { premiumPlanId: { $in: plans.map((p) => p._id) } },
          { transactionId: { $regex: searchVal, $options: "i" } },
          { status: { $regex: searchVal, $options: "i" } },
        ];
        if (userIdFilter) {
          match.$and = [
            { $or: searchOr },
            { userId: { $in: userIdFilter } },
          ];
        } else {
          match.$or = searchOr;
        }
      }
    }

    const sortFieldMap = {
      createdAt: "createdAt",
      email: "userId",
      country: "userId",
      planType: "premiumPlanId",
      status: "status",
      amount_total: "amount",
      currency: "currency",
    };
    const sortDir = sortOrder === "asc" ? 1 : -1;
    const sortField = sortFieldMap[sortKey] || "createdAt";
    const hasSort = typeof sortKey === "string" && sortKey.trim();
    let sortObj = { createdAt: -1 };
    if (hasSort && sortField) {
      if (sortField === "userId" || sortField === "premiumPlanId") {
        sortObj = {};
      } else {
        sortObj = { [sortField]: sortDir };
      }
    }

    let histories;
    if (hasSort && (sortKey === "email" || sortKey === "country")) {
      const pipeline = [
        { $match: match },
        { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "u", pipeline: [{ $project: { email: 1, country: 1 } }] } },
        { $unwind: { path: "$u", preserveNullAndEmptyArrays: true } },
        { $lookup: { from: "premiumplans", localField: "premiumPlanId", foreignField: "_id", as: "p", pipeline: [{ $project: { name: 1, tag: 1 } }] } },
        { $unwind: { path: "$p", preserveNullAndEmptyArrays: true } },
        { $sort: { [sortKey === "email" ? "u.email" : "u.country"]: sortDir, createdAt: -1 } },
        { $skip: skip },
        { $limit: limitNum },
        {
          $project: {
            country: { $ifNull: ["$u.country", null] },
            createdAt: 1,
            planType: { $ifNull: ["$p.name", "$p.tag"] },
            status: 1,
            amount_total: "$amount",
            currency: 1,
            flow: "$paymentGateway",
            email: { $ifNull: ["$u.email", null] },
          },
        },
      ];
      histories = await PremiumPlanHistory.aggregate(pipeline);
    } else if (hasSort && sortKey === "planType") {
      const pipeline = [
        { $match: match },
        { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "u", pipeline: [{ $project: { email: 1, country: 1 } }] } },
        { $unwind: { path: "$u", preserveNullAndEmptyArrays: true } },
        { $lookup: { from: "premiumplans", localField: "premiumPlanId", foreignField: "_id", as: "p", pipeline: [{ $project: { name: 1, tag: 1 } }] } },
        { $unwind: { path: "$p", preserveNullAndEmptyArrays: true } },
        { $addFields: { planType: { $ifNull: ["$p.name", "$p.tag"] } } },
        { $sort: { planType: sortDir, createdAt: -1 } },
        { $skip: skip },
        { $limit: limitNum },
        {
          $project: {
            country: { $ifNull: ["$u.country", null] },
            createdAt: 1,
            planType: 1,
            status: 1,
            amount_total: "$amount",
            currency: 1,
            flow: "$paymentGateway",
            email: { $ifNull: ["$u.email", null] },
          },
        },
      ];
      histories = await PremiumPlanHistory.aggregate(pipeline);
    } else if (hasSort && (sortKey === "amount_total" || sortKey === "currency")) {
      const pipeline = [
        { $match: match },
        { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "u", pipeline: [{ $project: { email: 1, country: 1 } }] } },
        { $unwind: { path: "$u", preserveNullAndEmptyArrays: true } },
        { $lookup: { from: "premiumplans", localField: "premiumPlanId", foreignField: "_id", as: "p", pipeline: [{ $project: { name: 1, tag: 1 } }] } },
        { $unwind: { path: "$p", preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            _sortAmount: { $ifNull: [{ $toDouble: "$amount" }, -1] },
          },
        },
        { $sort: sortKey === "amount_total" ? { _sortAmount: sortDir, createdAt: -1 } : { currency: sortDir, createdAt: -1 } },
        { $skip: skip },
        { $limit: limitNum },
        {
          $project: {
            country: { $ifNull: ["$u.country", null] },
            createdAt: 1,
            planType: { $ifNull: ["$p.name", "$p.tag"] },
            status: 1,
            amount_total: "$amount",
            currency: 1,
            flow: "$paymentGateway",
            email: { $ifNull: ["$u.email", null] },
          },
        },
      ];
      histories = await PremiumPlanHistory.aggregate(pipeline);
    } else {
      histories = await PremiumPlanHistory.find(match)
        .populate("userId", "email country")
        .populate("premiumPlanId", "name tag")
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .lean();
      histories = histories.map((h) => ({
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
    }

    const total = await PremiumPlanHistory.countDocuments(match);
    const data = histories;

    return res.status(200).json({
      status: true,
      message: "Subscriptions analytics retrieved successfully",
      data,
      total,
      page: pageNum,
      limit: limitNum,
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

// Get subscriptions chart data - month filter applied (startDate, endDate)
exports.getSubscriptionsChart = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const { matchFilter } = buildDateFilters(startDate, endDate);
    const match = { ...matchFilter };

    const [chartAgg, byCountryAgg] = await Promise.all([
      PremiumPlanHistory.aggregate([
        { $match: match },
        {
          $lookup: {
            from: "users",
            localField: "userId",
            foreignField: "_id",
            as: "u",
            pipeline: [{ $project: { country: 1 } }],
          },
        },
        { $unwind: { path: "$u", preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: {
              month: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
              country: { $ifNull: ["$u.country", "Unknown"] },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { "_id.month": 1 } },
      ]),
      PremiumPlanHistory.aggregate([
        { $match: match },
        {
          $lookup: {
            from: "users",
            localField: "userId",
            foreignField: "_id",
            as: "u",
            pipeline: [{ $project: { country: 1 } }],
          },
        },
        { $unwind: { path: "$u", preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: { $ifNull: ["$u.country", "Unknown"] },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ]),
    ]);

    const categoriesSet = new Set();
    const countryMap = {};
    chartAgg.forEach((r) => {
      const month = r._id.month;
      const country = r._id.country;
      categoriesSet.add(month);
      if (!countryMap[country]) countryMap[country] = {};
      countryMap[country][month] = r.count;
    });
    const categories = Array.from(categoriesSet).sort();
    const series = Object.entries(countryMap).map(([name, data]) => ({
      name,
      data: categories.map((m) => data[m] || 0),
    }));
    const byCountry = byCountryAgg.map((r) => ({ name: r._id, value: r.count }));

    return res.status(200).json({
      status: true,
      message: "Subscriptions chart retrieved successfully",
      data: {
        chartData: { categories, series },
        byCountry,
      },
    });
  } catch (error) {
    console.error("Error retrieving subscriptions chart:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get subscriptions filter options (unique countries, planTypes, statuses) for date range
exports.getSubscriptionsFilters = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const { matchFilter } = buildDateFilters(startDate, endDate);
    const match = { ...matchFilter };

    const [metaAgg] = await PremiumPlanHistory.aggregate([
      { $match: match },
      {
        $facet: {
          countries: [
            { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "u", pipeline: [{ $project: { country: 1 } }] } },
            { $unwind: { path: "$u", preserveNullAndEmptyArrays: true } },
            { $group: { _id: { $ifNull: ["$u.country", "Unknown"] } } },
            { $sort: { _id: 1 } },
          ],
          planTypes: [
            { $lookup: { from: "premiumplans", localField: "premiumPlanId", foreignField: "_id", as: "p", pipeline: [{ $project: { name: 1, tag: 1 } }] } },
            { $unwind: { path: "$p", preserveNullAndEmptyArrays: true } },
            { $group: { _id: { $ifNull: ["$p.name", "$p.tag"] } } },
            { $match: { _id: { $ne: null, $ne: "" } } },
            { $sort: { _id: 1 } },
          ],
          statuses: [
            { $group: { _id: "$status" } },
            { $match: { _id: { $ne: null } } },
            { $sort: { _id: 1 } },
          ],
          currencies: [
            { $group: { _id: "$currency" } },
            { $match: { _id: { $ne: null, $ne: "" } } },
            { $sort: { _id: 1 } },
          ],
        },
      },
    ]);

    const meta = metaAgg || {};
    const uniqueCountries = (meta.countries || []).map((r) => r._id).filter(Boolean).sort();
    const uniquePlanTypes = (meta.planTypes || []).map((r) => r._id).filter(Boolean).sort();
    const uniqueStatuses = (meta.statuses || []).map((r) => r._id).filter(Boolean).sort();
    const uniqueCurrencies = (meta.currencies || [])
      .map((r) => (r._id != null && r._id !== "" ? String(r._id).toUpperCase() : null))
      .filter(Boolean)
      .sort();

    return res.status(200).json({
      status: true,
      message: "Subscriptions filters retrieved successfully",
      data: { uniqueCountries, uniquePlanTypes, uniqueStatuses, uniqueCurrencies },
    });
  } catch (error) {
    console.error("Error retrieving subscriptions filters:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get registration analytics: total users and country-wise breakdown
exports.getRegistrationAnalytics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const match = {};
    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) {
        match.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        const d = new Date(endDate);
        d.setHours(23, 59, 59, 999);
        match.createdAt.$lte = d;
      }
    }

    const [byCountry, totalUsers] = await Promise.all([
      User.aggregate([
        { $match: match },
        {
          $group: {
            _id: {
              $ifNull: ["$country", "Unknown"],
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ]),
      User.countDocuments(match),
    ]);

    const countryBreakdown = byCountry.map((row) => ({
      country: row._id,
      count: row.count,
      percentage:
        totalUsers > 0 ? (row.count / totalUsers) * 100 : 0,
    }));

    return res.status(200).json({
      status: true,
      message: "Registration analytics retrieved successfully",
      data: {
        totalUsers,
        countryBreakdown,
      },
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

// Get incomplete payments analytics (approximated from PremiumPlanHistory)
exports.getIncompletePayments = async (req, res) => {
  try {
    const { startDate, endDate, page = 1, limit = 25, search = "" } = req.query;
    const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * (parseInt(limit, 10) || 25);
    const pageSize = parseInt(limit, 10) || 25;

    const { matchFilter } = buildDateFilters(startDate, endDate);
    const listQuery = await buildIncompletePaymentsQuery(matchFilter, search);

    const [totals, initiatedByMonth, completedByMonth, incompleteDocs, totalIncomplete] =
      await Promise.all([
        PremiumPlanHistory.aggregate([
          { $match: matchFilter },
          {
            $group: {
              _id: null,
              totalInitiated: { $sum: 1 },
              totalCompleted: {
                $sum: {
                  $cond: [{ $eq: ["$status", "active"] }, 1, 0],
                },
              },
            },
          },
        ]),
        PremiumPlanHistory.aggregate([
          { $match: matchFilter },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),
        PremiumPlanHistory.aggregate([
          {
            $match: {
              ...matchFilter,
              status: "active",
            },
          },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),
        PremiumPlanHistory.find(listQuery)
          .populate("userId", "fullName email country")
          .populate("premiumPlanId", "name heading tag")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(pageSize)
          .lean(),
        PremiumPlanHistory.countDocuments(listQuery),
      ]);

    const totalInitiated = totals[0]?.totalInitiated || 0;
    const totalCompleted = totals[0]?.totalCompleted || 0;
    const incomplete = Math.max(0, totalInitiated - totalCompleted);

    const initMap = {};
    initiatedByMonth.forEach((r) => {
      initMap[r._id] = r.count;
    });
    const compMap = {};
    completedByMonth.forEach((r) => {
      compMap[r._id] = r.count;
    });

    const allMonths = new Set([...Object.keys(initMap), ...Object.keys(compMap)]);
    const sortedMonths = Array.from(allMonths).sort();

    const byMonth = sortedMonths.map((m) => ({
      month: m,
      initiated: initMap[m] || 0,
      completed: compMap[m] || 0,
      incomplete: Math.max(0, (initMap[m] || 0) - (compMap[m] || 0)),
    }));

    const bulkData = incompleteDocs.map((h) => ({
      _id: h._id,
      sessionId: h.transactionId || null,
      email: h.userId?.email || null,
      userName: h.userId?.fullName || null,
      userId: h.userId?._id || null,
      planName:
        (h.premiumPlanId &&
          (h.premiumPlanId.name ||
            h.premiumPlanId.heading ||
            h.premiumPlanId.tag)) ||
        null,
      country: h.userId?.country || null,
      product_id: h.premiumPlanId?._id || null,
      createdAt: h.createdAt,
    }));

    return res.status(200).json({
      status: true,
      message: "Incomplete payments analytics retrieved successfully",
      data: {
        totalInitiated,
        totalCompleted,
        incomplete,
        byMonth,
        incompletePaymentsList: bulkData,
        total: totalIncomplete,
        page: parseInt(page, 10) || 1,
        limit: pageSize,
      }
    });
  } catch (error) {
    console.error("Error retrieving incomplete payments analytics:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Export current active table (CSV or PDF) and send via email - creates history, processes in background
exports.exportTable = async (req, res) => {
  try {
    const {
      tableType,
      format,
      email,
      startDate,
      endDate,
      search,
      subFilters,
      contentFilters,
      regFilters,
      overviewFilters,
      paymentFilters,
      sort,
    } = req.body;

    const validTableTypes = ["overview", "content", "subscriptions", "payments", "registrations"];
    if (!tableType || !validTableTypes.includes(tableType)) {
      return res.status(400).json({
        status: false,
        message: "Invalid tableType. Must be one of: overview, content, subscriptions, payments, registrations",
      });
    }

    const validFormats = ["csv", "pdf"];
    if (!format || !validFormats.includes(format)) {
      return res.status(400).json({
        status: false,
        message: "Invalid format. Must be csv or pdf",
      });
    }

    if (!email || typeof email !== "string" || !email.trim()) {
      return res.status(400).json({
        status: false,
        message: "Email is required for sending the export",
      });
    }

    const dateRangeLabel = startDate && endDate
      ? `${new Date(startDate).toLocaleString("default", { month: "short" })} ${new Date(startDate).getFullYear()}`
      : "All Time";

    const exportQuery = {
      applyFilters: APPLY_FILTERS_TO_EXPORT,
      startDate: startDate || null,
      endDate: endDate || null,
      search: APPLY_FILTERS_TO_EXPORT ? (search || null) : null,
      subFilters: APPLY_FILTERS_TO_EXPORT ? (subFilters || null) : null,
      contentFilters: APPLY_FILTERS_TO_EXPORT ? (contentFilters || null) : null,
      regFilters: APPLY_FILTERS_TO_EXPORT ? (regFilters || null) : null,
      overviewFilters: APPLY_FILTERS_TO_EXPORT ? (overviewFilters || null) : null,
      paymentFilters: APPLY_FILTERS_TO_EXPORT ? (paymentFilters || null) : null,
      sort: sort || null,
    };

    const exportRecord = new ExportHistory({
      tableType,
      format,
      dateRange: dateRangeLabel,
      email: email.trim(),
      requestedBy: req.admin?.adminId || null,
      status: "Pending",
      exportQuery,
    });
    await exportRecord.save();

    res.status(200).json({
      status: true,
      message: "Export request received. You will receive an email shortly once the report is generated.",
      data: exportRecord,
    });

    (async () => {
      try {
        const { matchFilter, dateFilterAnalytics } = buildDateFilters(startDate, endDate);
        const filters = {
          matchFilter,
          dateFilterAnalytics,
          search,
          subFilters,
          contentFilters,
          regFilters,
          overviewFilters,
          paymentFilters,
          sort,
        };

        const { title, headers, rows } = await fetchTableDataForExport(tableType, filters);

        const sanitizedEmail = email.replace(/[^a-zA-Z0-9]/g, "_");
        const ext = format === "pdf" ? "pdf" : "csv";
        const blobName = `exports/table_${tableType}_${sanitizedEmail}_${Date.now()}.${ext}`;
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        const periodNote = dateRangeLabel !== "All Time" ? ` (${dateRangeLabel})` : "";

        if (format === "csv") {
          const csvContent = buildCsvContent(title, headers, rows, periodNote);
          await blockBlobClient.upload(csvContent, Buffer.byteLength(csvContent, "utf8"), {
            blobHTTPHeaders: { blobContentType: "text/csv" },
          });
        } else {
          const pdfBuffer = await buildPdfBuffer(title, headers, rows, periodNote);
          await blockBlobClient.upload(pdfBuffer, pdfBuffer.length, {
            blobHTTPHeaders: { blobContentType: "application/pdf" },
          });
        }

        const cdnUrl = generateCdnUrl(containerName, blobName);
        exportRecord.reportStatus = "Success";
        exportRecord.downloadUrl = cdnUrl;
        await exportRecord.save();

        const formatLabel = format.toUpperCase();
        const subject = `Your ${title} Export (${formatLabel}) is Ready`;
        const emailHtml = buildExportEmailHtml(title, cdnUrl, formatLabel, periodNote);

        try {
          await sendEmail(email.trim(), subject, emailHtml, true);
          exportRecord.emailStatus = "Success";
          exportRecord.status = "Completed";
          exportRecord.error = null;
          await exportRecord.save();
          console.log(`Table export ${exportRecord._id} completed and email sent to ${email}`);
        } catch (emailErr) {
          console.error("Email send failed:", emailErr);
          exportRecord.emailStatus = "Failed";
          exportRecord.error = emailErr.message;
          await exportRecord.save();
        }
      } catch (err) {
        console.error("Table export background process failed:", err);
        exportRecord.reportStatus = "Failed";
        exportRecord.emailStatus = "Failed";
        exportRecord.status = "Failed";
        exportRecord.error = err.message;
        await exportRecord.save();
      }
    })();
  } catch (error) {
    console.error("Error initiating table export:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Resend export email (only when report is already generated)
exports.resendExportEmail = async (req, res) => {
  try {
    const { id } = req.params;
    const record = await ExportHistory.findById(id);

    if (!record) {
      return res.status(404).json({
        status: false,
        message: "Export record not found",
      });
    }

    if (!record.downloadUrl) {
      return res.status(400).json({
        status: false,
        message: "Report not yet generated. Cannot resend email until the report is ready.",
      });
    }

    const cdnUrl = record.downloadUrl;
    const email = record.email;

    let subject, emailHtml;
    if (record.tableType) {
      const title = getTableTitle(record.tableType);
      const formatLabel = (record.format || "csv").toUpperCase();
      const periodNote = record.dateRange && record.dateRange !== "All Time" ? ` (${record.dateRange})` : "";
      subject = `Your ${title} Export (${formatLabel}) is Ready`;
      emailHtml = buildExportEmailHtml(title, cdnUrl, formatLabel, periodNote);
    } else {
      subject = "Your Netcliff OTT Analytics Report is Ready";
      const types = (record.analyticsTypes || []).join(", ");
      emailHtml = `
        <div style="font-family: sans-serif; color: #333; max-width: 600px;">
          <h2 style="color: #26B7C1;">Analytics Report Generated</h2>
          <p>Hello,</p>
          <p>Your requested analytics report for <b>${types}</b> has been generated successfully.</p>
          <div style="margin: 30px 0;">
            <a href="${cdnUrl}" style="background-color: #26B7C1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: 700;">Download CSV Report</a>
          </div>
          <p style="font-size: 12px; color: #999;">This is an automated message from Netcliff Admin System.</p>
        </div>
      `;
    }

    await sendEmail(email, subject, emailHtml, true);
    record.emailStatus = "Success";
    record.error = null;
    await record.save();

    return res.status(200).json({
      status: true,
      message: "Email sent successfully",
    });
  } catch (error) {
    console.error("Error resending export email:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to send email",
      error: error.message,
    });
  }
};

// Get export history
exports.getExportHistory = async (req, res) => {
  try {
    const history = await ExportHistory.find()
      .populate("requestedBy", "name email")
      .sort({ createdAt: -1 })
      .limit(50);

    return res.status(200).json({
      status: true,
      message: "Export history retrieved successfully",
      data: history,
    });
  } catch (error) {
    console.error("Error retrieving export history:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};
