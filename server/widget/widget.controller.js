const Widget = require("./widget.model");
// Import Movie model for series lookup
const Movie = require("../movie/movie.model");
const Episode = require("../episode/episode.model");
const { blockCountryWise, } = require("../movie/movie.aggregations");
const { invalidateByPrefix } = require('../../util/cacheInvalidation');
const { generateHlsSignedUrls } = require("../movie/movie.controller");
const { getFromCache, setCache } = require('../../util/redisUtils');

exports.create = async (req, res, next) => {
  try {
    const { title, order, type, customApi, customApiEnabled, customApiRequiresAuth } = req.body;

    console.log("Widget creation request:", { title, order, type, customApi, customApiEnabled, customApiRequiresAuth });

    if (!type) {
      console.log("Validation failed: missing type");
      return res.status(400).json({
        status: false,
        message: "Type is required."
      });
    }

    // Check if type is valid
    if (![1, 2, 3, 4, 5].includes(type)) {
      console.log("Validation failed: invalid type", type);
      return res.status(400).json({
        status: false,
        message: "Type must be 1, 2, 3, 4, or 5."
      });
    }

    const newWidget = new Widget({
      title: title || "", // Title is optional
      order: order || 0,
      type,
      customApi: customApi || undefined,
      customApiEnabled: customApiEnabled || false,
      customApiRequiresAuth: customApiRequiresAuth || false
    });

    console.log("Saving widget:", newWidget);
    await newWidget.save();
    console.log("Widget saved successfully:", newWidget._id);

    return res.status(200).json({
      status: true,
      message: "Widget created successfully.",
      widget: newWidget,
    });
  } catch (error) {
    console.error("Error creating widget:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

exports.getAll = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, type, isActive, search } = req.query;

    const query = {};

    // Add search functionality
    if (search && search.trim()) {
      query.title = { $regex: search.trim(), $options: 'i' };
    }

    if (type && type !== '') {
      query.type = parseInt(type);
    }

    if (isActive !== undefined && isActive !== '') {
      query.isActive = isActive === 'true';
    }

    const widgets = await Widget.find(query)
      .sort({ order: 1, createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const total = await Widget.countDocuments(query);

    return res.status(200).json({
      status: true,
      message: "Widgets fetched successfully.",
      widgets,
      total,
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Error fetching widgets:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

exports.getById = async (req, res, next) => {
  try {
    const { widgetId } = req.params;

    const widget = await Widget.findById(widgetId);

    if (!widget) {
      return res.status(404).json({
        status: false,
        message: "Widget not found.",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Widget fetched successfully.",
      widget,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

exports.update = async (req, res, next) => {
  try {
    const { widgetId } = req.params;
    const { title, order, type, isActive, clickAble, customApi, customApiEnabled, customApiRequiresAuth } = req.body;

    const widget = await Widget.findById(widgetId);

    if (!widget) {
      return res.status(404).json({
        status: false,
        message: "Widget not found.",
      });
    }

    // Update fields if provided
    if (title !== undefined) widget.title = title;
    if (order !== undefined) widget.order = order;
    if (type !== undefined) {
      if (![1, 2, 3, 4, 5].includes(type)) {
        return res.status(400).json({
          status: false,
          message: "Type must be 1, 2, 3, 4, or 5."
        });
      }
      widget.type = type;
    }
    if (isActive !== undefined) widget.isActive = isActive;
    if (clickAble !== undefined) widget.clickAble = clickAble;
    if (customApi !== undefined) widget.customApi = customApi;
    if (customApiEnabled !== undefined) widget.customApiEnabled = customApiEnabled;
    if (customApiRequiresAuth !== undefined) widget.customApiRequiresAuth = customApiRequiresAuth;

    await widget.save();

    // Invalidate widget-specific cache
    await invalidateByPrefix(`/widget/${widgetId}/series/public`);

    return res.status(200).json({
      status: true,
      message: "Widget updated successfully.",
      widget,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

exports.delete = async (req, res, next) => {
  try {
    const { widgetId } = req.params;

    const widget = await Widget.findByIdAndDelete(widgetId);

    if (!widget) {
      return res.status(404).json({
        status: false,
        message: "Widget not found.",
      });
    }

    // Invalidate widget-specific cache
    await invalidateByPrefix(`/widget/${widgetId}/series/public`);

    return res.status(200).json({
      status: true,
      message: "Widget deleted successfully.",
      widgetId,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

exports.toggleStatus = async (req, res, next) => {
  try {
    const { widgetId } = req.params;

    const widget = await Widget.findById(widgetId);

    if (!widget) {
      return res.status(404).json({
        status: false,
        message: "Widget not found.",
      });
    }

    widget.isActive = !widget.isActive;
    await widget.save();

    // Invalidate widget-specific cache
    await invalidateByPrefix(`/widget/${widgetId}/series/public`);

    return res.status(200).json({
      status: true,
      message: "Widget status updated successfully.",
      widget,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

exports.reorder = async (req, res, next) => {
  try {
    const { widgets } = req.body; // Array of { widgetId, order }

    if (!Array.isArray(widgets)) {
      return res.status(400).json({
        status: false,
        message: "Widgets array is required.",
      });
    }

    // Update each widget's order
    for (const item of widgets) {
      await Widget.findByIdAndUpdate(item.widgetId, { order: item.order });

      // Invalidate cache for each widget
      await invalidateByPrefix(`widget-series:${item.widgetId}`);
    }

    return res.status(200).json({
      status: true,
      message: "Widgets reordered successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// Get active widgets for frontend
exports.getActiveWidgets = async (req, res, next) => {
  try {
    const widgets = await Widget.find({ isActive: true })
      .sort({ order: 1, createdAt: -1 })
      .exec();

    return res.status(200).json({
      status: true,
      message: "Active widgets fetched successfully.",
      widgets,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// Add series to widget
exports.addSeriesToWidget = async (req, res, next) => {
  try {
    const { widgetId } = req.params;
    const { seriesId } = req.body;

    if (!seriesId) {
      return res.status(400).json({
        status: false,
        message: "Series ID is required.",
      });
    }

    const widget = await Widget.findById(widgetId);

    if (!widget) {
      return res.status(404).json({
        status: false,
        message: "Widget not found.",
      });
    }

    // Check if series already exists in widget
    if (widget.seriesIds.includes(seriesId)) {
      return res.status(400).json({
        status: false,
        message: "Series already exists in this widget.",
      });
    }

    // Add series to widget
    widget.seriesIds.push(seriesId);
    await widget.save();

    // Invalidate widget-specific cache
    await invalidateByPrefix(`/widget/${widgetId}/series/public`);

    return res.status(200).json({
      status: true,
      message: "Series added to widget successfully.",
      widget,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// Remove series from widget
exports.removeSeriesFromWidget = async (req, res, next) => {
  try {
    const { widgetId, seriesId } = req.params;

    const widget = await Widget.findById(widgetId);

    if (!widget) {
      return res.status(404).json({
        status: false,
        message: "Widget not found.",
      });
    }

    // Remove series from widget
    widget.seriesIds = widget.seriesIds.filter(id => id !== seriesId);
    await widget.save();

    // Invalidate widget-specific cache
    await invalidateByPrefix(`/widget/${widgetId}/series/public`);

    return res.status(200).json({
      status: true,
      message: "Series removed from widget successfully.",
      widget,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// Reorder series in widget
exports.reorderSeriesInWidget = async (req, res, next) => {
  try {
    const { widgetId } = req.params;
    const { seriesIds } = req.body; // Array of series IDs in new order

    if (!Array.isArray(seriesIds)) {
      return res.status(400).json({
        status: false,
        message: "Series IDs array is required.",
      });
    }

    const widget = await Widget.findById(widgetId);

    if (!widget) {
      return res.status(404).json({
        status: false,
        message: "Widget not found.",
      });
    }

    // Update series order
    widget.seriesIds = seriesIds;
    await widget.save();

    // Invalidate widget-specific cache
    await invalidateByPrefix(`/widget/${widgetId}/series/public`);

    return res.status(200).json({
      status: true,
      message: "Series reordered successfully.",
      widget,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// Get widget with series details
exports.getWidgetWithSeries = async (req, res, next) => {
  try {
    const { widgetId } = req.params;
    const mongoose = require('mongoose');

    const result = await Widget.aggregate([
      {
        $match: { _id: new mongoose.Types.ObjectId(widgetId) }
      },
      {
        $lookup: {
          from: "movies",
          let: { seriesIds: "$seriesIds" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $in: ["$_id", { $map: { input: "$$seriesIds", as: "id", in: { $toObjectId: "$$id" } } }] },
                    { $eq: ["$media_type", "tv"] }
                  ]
                }
              }
            },
            {
              $addFields: {
                sortOrder: {
                  $indexOfArray: ["$$seriesIds", { $toString: "$_id" }]
                }
              }
            },
            {
              $sort: { sortOrder: 1 }
            },
            {
              $project: {
                title: 1,
                thumbnail: 1,
                image: 1,
                description: 1,
                year: 1,
                media_type: 1,
                status: 1,
                type: 1
              }
            }
          ],
          as: "seriesData"
        }
      }
    ]);

    if (!result || result.length === 0) {
      return res.status(404).json({
        status: false,
        message: "Widget not found.",
      });
    }

    const widget = result[0];

    return res.status(200).json({
      status: true,
      message: "Widget with series fetched successfully.",
      widget,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// Get widget series details for mobile app (public API with pagination)
exports.getWidgetSeriesPublic = async (req, res, next) => {
  try {

    const { widgetId } = req.params;
    const { page = 1, perPage = 10 } = req.query;

    // Validate widgetId
    if (!widgetId) {
      return res.status(400).json({
        status: false,
        message: "Widget ID is required.",
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

    // Find the widget
    const widget = await Widget.findById(widgetId);
    if (!widget) {
      return res.status(404).json({
        status: false,
        message: "Widget not found.",
      });
    }

    // Check if widget is active
    if (!widget.isActive) {
      return res.status(404).json({
        status: false,
        message: "Widget is not active.",
      });
    }

    // Get series IDs from widget
    const seriesIds = widget.seriesIds || [];

    if (seriesIds.length === 0) {
      return res.status(200).json({
        status: true,
        message: "No series found in this widget.",
        series: [],
        page: paginationQuery.page,
        perPage: paginationQuery.perPage,
      });
    }

    const badgesLookup = {
      $lookup: {
        from: "badges",
        localField: "badges",
        foreignField: "_id",
        as: "badges"
      }
    };

    const badgesProject = {
      $addFields: {
        badges: {
          $map: {
            input: "$badges",
            as: "badge",
            in: {
              name: "$$badge.name",
              placement: "$$badge.placement",
              style: "$$badge.style",
              bgColor: "$$badge.bgColor",
              textColor: "$$badge.textColor",
            }
          }
        }
      }
    }

    
    // Build aggregation pipeline
    const pipeline = [
      // Match series that are in the widget and published
      {
        $match: {
          _id: { $in: seriesIds.map(id => new require("mongoose").Types.ObjectId(id)) },
          status: "PUBLISHED"
        }
      },
      // Lookup first two episodes in single query
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
        $project: {
          episodes: 0,
          runtime: 0,
          'firstEpisode.runtime': 0,
          'secondEpisode.runtime': 0
        }
      },
      // Lookup Badges
      badgesLookup,
      badgesProject,
      // Sort by the order they appear in the widget
      {
        $addFields: {
          sortOrder: {
            $indexOfArray: [seriesIds, { $toString: "$_id" }]
          }
        }
      },
      {
        $sort: { sortOrder: 1 }
      },
      // Apply pagination
      {
        $skip: (paginationQuery.page - 1) * paginationQuery.perPage
      },
      {
        $limit: paginationQuery.perPage
      },
      // // Remove the sortOrder field from final result
      // {
      //   $project: {
      //     sortOrder: 0
      //   }
      // }
    ];

    // Get total count for pagination
    // const countPipeline = [
    //   {
    //     $match: {
    //       _id: { $in: seriesIds.map(id => new require("mongoose").Types.ObjectId(id)) },
    //       status: "PUBLISHED"
    //     }
    //   },
    //   {
    //     $count: "total"
    //   }
    // ];

    const series = await Movie.aggregate(pipeline, { gamification: true })

    // Generate Mux URLs for series with first and second episodes
    const enrichedSeries = await Promise.all(series.map(async (seriesItem) => {
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
              // Static error for testing
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

    return res.status(200).json({
      status: true,
      message: "Widget series fetched successfully.",
      series: enrichedSeries,
      page: paginationQuery.page,
      perPage: paginationQuery.perPage,
      widget: {
        _id: widget._id,
        title: widget.title,
        type: widget.type,
        clickAble: widget.clickAble
      }
    });
  } catch (error) {
    console.error("Error fetching widget series:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
}; 
