const BrandIntegration = require("./brandIntegration.model");
const BrandIntegrationEvent = require("./brandIntegrationEvent.model");
const Brand = require("../brand/brand.model");
const Episode = require("../episode/episode.model");
const Movie = require("../movie/movie.model");
const Shop = require("../shop/shop.model");
const {
  CAMPAIGN_TARGET_LEVELS
} = require("../../util/constants");
const { deleteCacheByPattern } = require("../../util/redisUtils");
const { processAstonCampaigns } = require("../../util/astonPlacementHelper");

// Create a new brand integration
exports.create = async (req, res) => {
  try {
    let { brandId, campaignName, campaignURL, brandLogoUrl, priority, isActive, startDate, endDate, placements, userCategory } = req.body;

    // Parse placements if it's a JSON string
    if (typeof placements === 'string') {
      try {
        placements = JSON.parse(placements);
      } catch (parseError) {
        return res.status(400).json({
          status: false,
          message: "Invalid placements format. Must be a valid JSON array."
        });
      }
    }

    // Parse userCategory if it's a JSON string
    if (typeof userCategory === 'string') {
      try {
        userCategory = JSON.parse(userCategory);
      } catch (parseError) {
        return res.status(400).json({
          status: false,
          message: "Invalid userCategory format. Must be a valid JSON array."
        });
      }
    }

    // Basic validation
    if (!brandId || !campaignName || !campaignURL || !brandLogoUrl || !startDate || !endDate || !placements) {
      return res.status(400).json({
        status: false,
        message: "Missing required fields: brandId, campaignName, campaignURL, brandLogoUrl, startDate, endDate, placements"
      });
    }

    // Verify brand exists
    const brandExists = await Brand.exists({ _id: brandId });
    if (!brandExists) {
      return res.status(400).json({
        status: false,
        message: `Brand with ID ${brandId} does not exist`
      });
    }

    // Validate placements array
    if (!Array.isArray(placements) || placements.length === 0) {
      return res.status(400).json({
        status: false,
        message: "At least one placement is required"
      });
    }

    // Validate each placement and verify targets exist
    for (let i = 0; i < placements.length; i++) {
      const placement = placements[i];

      if (!placement.type) {
        return res.status(400).json({
          status: false,
          message: `Placement ${i + 1}: type is required`
        });
      }

      if (!placement.title) {
        return res.status(400).json({
          status: false,
          message: `Placement ${i + 1}: title is required`
        });
      }

      // Validate targets array
      if (!placement.target || !Array.isArray(placement.target) || placement.target.length === 0) {
        return res.status(400).json({
          status: false,
          message: `Placement ${i + 1}: at least one target is required`
        });
      }

      // Verify each target exists (skip verification for allLiveSeries targets)
      for (let j = 0; j < placement.target.length; j++) {
        const target = placement.target[j];

        if (!target.level) {
          return res.status(400).json({
            status: false,
            message: `Placement ${i + 1}, Target ${j + 1}: level is required`
          });
        }

        // Skip refId validation if allLiveSeries is true
        if (target.allLiveSeries) {
          if (target.level !== CAMPAIGN_TARGET_LEVELS.SERIES) {
            return res.status(400).json({
              status: false,
              message: `Placement ${i + 1}, Target ${j + 1}: allLiveSeries can only be used with SERIES level`
            });
          }
          // Skip refId validation for allLiveSeries
          continue;
        }

        // For non-allLiveSeries targets, validate refId
        if (!target.refId) {
          return res.status(400).json({
            status: false,
            message: `Placement ${i + 1}, Target ${j + 1}: refId is required when allLiveSeries is not true`
          });
        }

        let targetExists = false;
        switch (target.level) {
          case CAMPAIGN_TARGET_LEVELS.EPISODE:
            targetExists = await Episode.exists({ _id: target.refId });
            break;
          case CAMPAIGN_TARGET_LEVELS.SERIES:
            targetExists = await Movie.exists({ _id: target.refId });
            break;
        }

        if (!targetExists) {
          return res.status(400).json({
            status: false,
            message: `Placement ${i + 1}, Target ${j + 1}: ${target.level} with ID ${target.refId} does not exist`
          });
        }
      }
    }

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start >= end) {
      return res.status(400).json({
        status: false,
        message: "startDate must be before endDate"
      });
    }

    // Create brand integration instance
    const brandIntegration = new BrandIntegration({
      brandId,
      campaignName,
      campaignURL,
      brandLogoUrl,
      priority: priority !== undefined ? priority : 0,
      isActive: isActive !== undefined ? isActive : true,
      startDate: start,
      endDate: end,
      placements,
      userCategory: userCategory || undefined, // Use schema default if not provided
      createdBy: req.admin ? req.admin._id : null
    });

    // Validate placements
    try {
      brandIntegration.validatePlacements();
    } catch (validationError) {
      return res.status(400).json({
        status: false,
        message: `Placement validation failed: ${validationError.message}`
      });
    }

    // Check for existing active placements per episode (max 3 total placements per episode)
    // Group placements by episode
    const episodePlacementsMap = new Map();

    placements.forEach(placement => {
      // A placement can have multiple targets
      placement.target.forEach(target => {
        if (target.level === CAMPAIGN_TARGET_LEVELS.EPISODE) {
          const episodeId = target.refId.toString();
          if (!episodePlacementsMap.has(episodeId)) {
            episodePlacementsMap.set(episodeId, []);
          }
          episodePlacementsMap.get(episodeId).push(placement);
        }
      });
    });

    // Check each episode
    for (const [episodeId, episodePlacements] of episodePlacementsMap) {
      // Count existing active placements for this episode across all brand integrations
      const existingIntegrations = await BrandIntegration.find({
        isActive: true,
        startDate: { $lte: end },
        endDate: { $gte: start },
        'placements.target.level': CAMPAIGN_TARGET_LEVELS.EPISODE,
        'placements.target.refId': episodeId
      });

      let totalPlacementCount = 0;
      existingIntegrations.forEach(integration => {
        integration.placements.forEach(placement => {
          placement.target.forEach(target => {
            if (target.level === CAMPAIGN_TARGET_LEVELS.EPISODE &&
              target.refId.toString() === episodeId) {
              totalPlacementCount++;
            }
          });
        });
      });

      // Add current placements count for this episode
      const currentPlacementCount = episodePlacements.length;

      if (totalPlacementCount + currentPlacementCount > 3) {
        return res.status(400).json({
          status: false,
          message: `Maximum 3 active placements allowed per episode. Episode ${episodeId} would have ${totalPlacementCount + currentPlacementCount} placements.`
        });
      }
    }

    // Save brand integration
    await brandIntegration.save();

    return res.status(200).json({
      status: true,
      message: "Brand integration created successfully",
      brandIntegration
    });

  } catch (error) {
    console.error("Error creating brand integration:", error);

    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error"
    });
  }
};

// Get all brand integrations (admin)
exports.getAll = async (req, res) => {
  try {
    const {
      brandId,
      isActive,
      page = 1,
      limit = 20
    } = req.query;

    const query = {};

    if (brandId) query.brandId = brandId;
    if (isActive !== undefined) query.isActive = isActive === 'true';

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const brandIntegrations = await BrandIntegration.find(query)
      .populate('brandId', 'brandName')
      .sort({ priority: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Transform brandName to name
    const transformedIntegrations = brandIntegrations.map(integration => ({
      ...integration,
      brand: integration.brandId ? {
        _id: integration.brandId._id,
        name: integration.brandId.brandName
      } : integration.brandId
    }));

    const total = await BrandIntegration.countDocuments(query);

    return res.status(200).json({
      status: true,
      brandIntegrations: transformedIntegrations,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error("Error fetching brand integrations:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error"
    });
  }
};

// Get brand integration by ID
exports.getById = async (req, res) => {
  try {
    const { brandIntegrationId } = req.params;

    const brandIntegration = await BrandIntegration.findById(brandIntegrationId)
      .populate('brandId', 'brandName')
      .lean();

    if (!brandIntegration) {
      return res.status(404).json({
        status: false,
        message: "Brand integration not found"
      });
    }

    // Transform brandName to name
    const transformedIntegration = {
      ...brandIntegration,
      brandId: brandIntegration.brandId ? {
        _id: brandIntegration.brandId._id,
        name: brandIntegration.brandId.brandName
      } : brandIntegration.brandId
    };

    return res.status(200).json({
      status: true,
      brandIntegration: transformedIntegration
    });

  } catch (error) {
    console.error("Error fetching brand integration:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error"
    });
  }
};

// Update brand integration
exports.update = async (req, res) => {
  try {
    const { brandIntegrationId } = req.params;
    const updates = req.body;

    // Parse placements if it's a JSON string
    if (updates.placements && typeof updates.placements === 'string') {
      try {
        updates.placements = JSON.parse(updates.placements);
      } catch (parseError) {
        return res.status(400).json({
          status: false,
          message: "Invalid placements format. Must be a valid JSON array."
        });
      }
    }

    // Parse userCategory if it's a JSON string
    if (updates.userCategory && typeof updates.userCategory === 'string') {
      try {
        updates.userCategory = JSON.parse(updates.userCategory);
      } catch (parseError) {
        return res.status(400).json({
          status: false,
          message: "Invalid userCategory format. Must be a valid JSON array."
        });
      }
    }

    const brandIntegration = await BrandIntegration.findById(brandIntegrationId);

    if (!brandIntegration) {
      return res.status(404).json({
        status: false,
        message: "Brand integration not found"
      });
    }

    // Verify brand exists if being updated
    if (updates.brandId) {
      const brandExists = await Brand.exists({ _id: updates.brandId });
      if (!brandExists) {
        return res.status(400).json({
          status: false,
          message: `Brand with ID ${updates.brandId} does not exist`
        });
      }
    }

    // Verify targets exist if placements are being updated
    if (updates.placements && Array.isArray(updates.placements)) {
      for (let i = 0; i < updates.placements.length; i++) {
        const placement = updates.placements[i];

        if (placement.target && Array.isArray(placement.target)) {
          for (let j = 0; j < placement.target.length; j++) {
            const target = placement.target[j];

            // Skip validation for allLiveSeries targets
            if (target.allLiveSeries) {
              if (target.level && target.level !== CAMPAIGN_TARGET_LEVELS.SERIES) {
                return res.status(400).json({
                  status: false,
                  message: `Placement ${i + 1}, Target ${j + 1}: allLiveSeries can only be used with SERIES level`
                });
              }
              continue;
            }

            if (target.level && target.refId) {
              let targetExists = false;
              switch (target.level) {
                case CAMPAIGN_TARGET_LEVELS.EPISODE:
                  targetExists = await Episode.exists({ _id: target.refId });
                  break;
                case CAMPAIGN_TARGET_LEVELS.SERIES:
                  targetExists = await Movie.exists({ _id: target.refId });
                  break;
              }

              if (!targetExists) {
                return res.status(400).json({
                  status: false,
                  message: `Placement ${i + 1}, Target ${j + 1}: ${target.level} with ID ${target.refId} does not exist`
                });
              }
            }
          }
        }
      }
    }

    // Update allowed fields
    const allowedUpdates = ['brandId', 'campaignName', 'campaignURL', 'brandLogoUrl', 'priority', 'isActive', 'startDate', 'endDate', 'placements', 'userCategory'];

    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) {
        brandIntegration[key] = updates[key];
      }
    }

    // Validate placements if updated
    if (updates.placements) {
      try {
        brandIntegration.validatePlacements();
      } catch (validationError) {
        return res.status(400).json({
          status: false,
          message: `Placement validation failed: ${validationError.message}`
        });
      }
    }

    await brandIntegration.save();

    return res.status(200).json({
      status: true,
      message: "Brand integration updated successfully",
      brandIntegration
    });

  } catch (error) {
    console.error("Error updating brand integration:", error);

    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error"
    });
  }
};

// Update brand integration status (activate/deactivate)
exports.updateStatus = async (req, res) => {
  try {
    const { brandIntegrationId } = req.params;
    const { status } = req.body;

    // Validate isActive field
    if (typeof status !== 'string' || !['ACTIVE', 'INACTIVE'].includes(status)) {
      return res.status(400).json({
        status: false,
        message: "status must be a string value (ACTIVE or INACTIVE)"
      });
    }

    // Find and update brand integration
    const brandIntegration = await BrandIntegration.findByIdAndUpdate(
      brandIntegrationId,
      { isActive: status === 'ACTIVE' },
      { new: true, runValidators: true }
    );

    if (!brandIntegration) {
      return res.status(404).json({
        status: false,
        message: "Brand integration not found"
      });
    }

    return res.status(200).json({
      status: true,
      message: `Brand integration ${status === 'ACTIVE' ? 'activated' : 'deactivated'} successfully`,
      brandIntegration: {
        _id: brandIntegration._id,
        brandId: brandIntegration.brandId,
        campaignName: brandIntegration.campaignName,
        isActive: status === 'ACTIVE' ? true : false
      }
    });

  } catch (error) {
    console.error("Error updating brand integration status:", error);

    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error"
    });
  }
};

// Delete brand integration
exports.delete = async (req, res) => {
  try {
    const { brandIntegrationId } = req.params;

    const brandIntegration = await BrandIntegration.findByIdAndDelete(brandIntegrationId);

    if (!brandIntegration) {
      return res.status(404).json({
        status: false,
        message: "Brand integration not found"
      });
    }

    return res.status(200).json({
      status: true,
      message: "Brand integration deleted successfully"
    });

  } catch (error) {
    console.error("Error deleting brand integration:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error"
    });
  }
};

// Track brand integration event
exports.trackEvent = async (req, res) => {
  try {
    const {
      eventType,
      userId,
      sessionId,
      episodeId,
      brandIntegrationId,
      brandId,
      timestamp,
      metadata
    } = req.body;

    // Validate required fields
    if (!eventType || !sessionId || !episodeId || !brandIntegrationId || !brandId) {
      return res.status(400).json({
        status: false,
        message: "Missing required fields: eventType, sessionId, episodeId, brandIntegrationId, brandId"
      });
    }

    // Create event
    const event = new BrandIntegrationEvent({
      eventType,
      userId: userId || null,
      sessionId,
      episodeId,
      brandIntegrationId,
      brandId,
      timestamp: timestamp ? new Date(timestamp) : new Date(),
      metadata: metadata || {}
    });

    await event.save();

    return res.status(200).json({
      status: true,
      message: "Event tracked successfully",
      event: {
        _id: event._id,
        eventType: event.eventType,
        timestamp: event.timestamp
      }
    });

  } catch (error) {
    console.error("Error tracking brand integration event:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error"
    });
  }
};

// Get brand integration analytics (admin)
exports.getAnalytics = async (req, res) => {
  try {
    const { brandIntegrationId, brandId, startDate, endDate } = req.query;

    const query = {};

    if (brandIntegrationId) query.brandIntegrationId = brandIntegrationId;
    if (brandId) query.brandId = brandId;
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    // Aggregate events by type
    const analytics = await BrandIntegrationEvent.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            brandIntegrationId: '$brandIntegrationId',
            eventType: '$eventType'
          },
          count: { $sum: 1 },
          uniqueUsers: { $addToSet: '$userId' },
          uniqueSessions: { $addToSet: '$sessionId' }
        }
      },
      {
        $project: {
          _id: 0,
          brandIntegrationId: '$_id.brandIntegrationId',
          eventType: '$_id.eventType',
          count: 1,
          uniqueUsers: { $size: '$uniqueUsers' },
          uniqueSessions: { $size: '$uniqueSessions' }
        }
      },
      {
        $sort: { brandIntegrationId: 1, eventType: 1 }
      }
    ]);

    return res.status(200).json({
      status: true,
      analytics
    });

  } catch (error) {
    console.error("Error fetching brand integration analytics:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error"
    });
  }
};

// Get campaigns for a specific episode (public API with optional user authentication)
// This endpoint returns brand integration campaigns that should be shown for a given episode
exports.getCampaignsForEpisode = async (req, res) => {
  try {
    const { seriesId, episodeId } = req.query;
    const { SUBSCRIPTION_TYPES } = require("../../util/constants");

    // Validate required parameters
    if (!episodeId) {
      return res.status(400).json({
        status: false,
        message: "episodeId is required"
      });
    }

    // Determine user subscription type (works with optional authentication)
    let userSubscriptionType = SUBSCRIPTION_TYPES.FREE;
    
    if (req.user) {
      if (req.user.isPremiumPlan) {
        userSubscriptionType = SUBSCRIPTION_TYPES.PREMIUM;
      } else if (req.user.freeTrial?.isActive) {
        userSubscriptionType = SUBSCRIPTION_TYPES["FREE-TRAIL"];
      }
    }


    // Fetch episode details to get runtime
    let episodeRuntime = 0;
    try {
      const episode = await Episode.findById(episodeId).select('runtime').lean();
      if (episode && episode.runtime) {
        episodeRuntime = episode.runtime;
      }
    } catch (episodeError) {
      console.error('[Get Campaigns] Error fetching episode:', episodeError);
      // Continue without runtime - will use default in processAstonCampaigns
    }

    const currentDate = new Date();

    // Build query to find active brand integrations
    const query = {
      isActive: true,
      startDate: { $lte: currentDate },
      endDate: { $gte: currentDate }
    };

    const targetOrConditions = [];

    // 1. Direct episode targeting
    targetOrConditions.push({
      'placements.target.level': 'EPISODE',
      'placements.target.refId': episodeId
    });

    // 2. Series-level targeting (if seriesId provided)
    if (seriesId) {
      targetOrConditions.push({
        'placements.target.level': 'SERIES',
        'placements.target.refId': seriesId
      });
    }

    // 3. All live series targeting
    targetOrConditions.push({
      'placements.target.allLiveSeries': true,
      'placements.target.level': 'SERIES'
    });

    // Combine user category filter with target conditions
    query.$and = [
      {
        $or: [
          { userCategory: SUBSCRIPTION_TYPES.FREE }, // Show to all if FREE is included
          { userCategory: userSubscriptionType } // Or show if user's subscription matches
        ]
      },
      { $or: targetOrConditions }
    ];


    // Fetch matching brand integrations
    // Sort by priority (ascending - lower number = higher priority)
    // Then by updatedAt (descending - latest updated shown first for same priority)
    const brandIntegrations = await BrandIntegration.find(query)
      .populate('brandId', 'brandName')
      .sort({ priority: 1, updatedAt: -1 })
      .lean();


    // Build campaign maps similar to widget controller
    const episodeCampaignsMap = new Map();
    const seriesAllEpisodesCampaignsMap = new Map();
    const allLiveSeriesCampaigns = [];

    brandIntegrations.forEach(campaign => {
      if (campaign.placements && Array.isArray(campaign.placements)) {
        campaign.placements.forEach(placement => {
          if (placement.target && Array.isArray(placement.target)) {
            // Create a campaign object with this specific placement
            const campaignWithPlacement = {
              ...campaign,
              placements: [placement] // Only include this placement
            };

            // Process each target in the placement
            placement.target.forEach(target => {
              // Handle allLiveSeries targeting
              if (target.allLiveSeries && target.level === 'SERIES') {
                allLiveSeriesCampaigns.push(campaignWithPlacement);
                return;
              }

              if (!target.level || !target.refId) return;

              const refId = target.refId.toString();

              if (target.level === 'EPISODE') {
                // Direct episode targeting
                if (!episodeCampaignsMap.has(refId)) {
                  episodeCampaignsMap.set(refId, []);
                }
                episodeCampaignsMap.get(refId).push(campaignWithPlacement);
              } else if (target.level === 'SERIES') {
                // Series-level targeting
                if (target.episodes === 'all') {
                  // Apply to all episodes of this series
                  if (!seriesAllEpisodesCampaignsMap.has(refId)) {
                    seriesAllEpisodesCampaignsMap.set(refId, []);
                  }
                  seriesAllEpisodesCampaignsMap.get(refId).push(campaignWithPlacement);
                } else if (Array.isArray(target.episodes)) {
                  // Apply to specific episodes only
                  target.episodes.forEach(epId => {
                    const episodeIdStr = epId.toString();
                    if (!episodeCampaignsMap.has(episodeIdStr)) {
                      episodeCampaignsMap.set(episodeIdStr, []);
                    }
                    episodeCampaignsMap.get(episodeIdStr).push(campaignWithPlacement);
                  });
                }
              }
            });
          }
        });
      }
    });

    // Get campaigns for this specific episode
    const episodeIdStr = episodeId.toString();
    const episodeLevelCampaigns = episodeCampaignsMap.get(episodeIdStr) || [];
    
    // Get series-level campaigns (if seriesId provided)
    const seriesAllEpisodesCampaigns = seriesId 
      ? (seriesAllEpisodesCampaignsMap.get(seriesId.toString()) || [])
      : [];

    // Combine all campaign sources (same logic as widget controller)
    let allCampaigns = [
      ...episodeLevelCampaigns,
      ...seriesAllEpisodesCampaigns,
      ...allLiveSeriesCampaigns
    ];


    // Apply timestamp-based tie-breaker for campaigns with same priority
    // Sort by priority (ascending) then by updatedAt (descending - newest first)
    allCampaigns = allCampaigns.sort((a, b) => {
      const priorityDiff = (a.priority || 0) - (b.priority || 0);
      if (priorityDiff !== 0) {
        return priorityDiff; // Sort by priority first
      }
      // If priorities are equal, sort by updatedAt (newest first)
      const aUpdated = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bUpdated = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bUpdated - aUpdated; // Descending order (newest first)
    });

    // Use the same processAstonCampaigns function as widget controller
    // Note: processAstonCampaigns will also sort by priority, but our pre-sort
    // ensures that for same-priority campaigns, the newest ones are preferred
    const processedCampaigns = processAstonCampaigns(allCampaigns, episodeRuntime);


    // Add isSaved flag for authenticated users
    let campaignsWithSavedStatus = processedCampaigns;
    
    if (req.user) {
      try {
        const shop = await Shop.findOne({ userId: req.user.userId }).lean();
        
        if (shop) {
          // Create a Set of saved campaign IDs for O(1) lookup
          // Support both campaignId (new) and brandIntegrationId (old) fields
          const savedCampaignIds = new Set(
            shop.savedAstons.map(aston => {
              // Use campaignId if available, fallback to brandIntegrationId for backward compatibility
              const id = aston.campaignId || aston.brandIntegrationId;
              return id ? id.toString() : null;
            }).filter(id => id !== null)
          );
          
          
          // Add isSaved flag to each campaign
          campaignsWithSavedStatus = processedCampaigns.map(campaign => ({
            ...campaign,
            isSaved: savedCampaignIds.has(campaign._id.toString())
          }));
        } else {
          // No shop found, mark all as not saved
          campaignsWithSavedStatus = processedCampaigns.map(campaign => ({
            ...campaign,
            isSaved: false
          }));
        }
      } catch (shopError) {
        console.error('[Get Campaigns] Error fetching shop data:', shopError);
        // Continue without isSaved flag if there's an error
        campaignsWithSavedStatus = processedCampaigns.map(campaign => ({
          ...campaign,
          isSaved: false
        }));
      }
    } else {
      // User not authenticated, mark all as not saved
      campaignsWithSavedStatus = processedCampaigns.map(campaign => ({
        ...campaign,
        isSaved: false
      }));
    }

    return res.status(200).json({
      status: true,
      message: "Campaigns fetched successfully",
      episodeId,
      seriesId: seriesId || null,
      episodeRuntime, // Runtime in seconds
      userSubscriptionType,
      campaigns: campaignsWithSavedStatus,
      count: campaignsWithSavedStatus.length
    });

  } catch (error) {
    console.error("Error fetching campaigns for episode:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error"
    });
  }
};
