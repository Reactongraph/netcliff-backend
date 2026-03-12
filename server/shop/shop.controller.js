const Shop = require("./shop.model");
const BrandIntegration = require("../brandIntegration/brandIntegration.model");
const BrandIntegrationEvent = require("../brandIntegration/brandIntegrationEvent.model");
const { CAMPAIGN_EVENT_TYPES } = require("../../util/constants");

/**
 * Save an Aston campaign to user's shop
 * POST /shop/
 */
exports.saveAston = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { campaignId } = req.body;

    console.log('[Save Aston] userId:', userId);
    console.log('[Save Aston] campaignId:', campaignId);

    // Validate input
    if (!campaignId) {
      return res.status(400).json({
        status: false,
        message: "campaignId is required"
      });
    }

    // Fetch brand integration to verify it exists and get details
    const brandIntegration = await BrandIntegration.findById(campaignId)
      .populate('brandId', 'brandName')
      .lean();

    console.log('[Save Aston] Brand integration found:', brandIntegration ? 'Yes' : 'No');

    if (!brandIntegration) {
      return res.status(404).json({
        status: false,
        message: "Brand integration not found"
      });
    }

    // Check if the brand integration is active
    if (!brandIntegration.isActive) {
      return res.status(400).json({
        status: false,
        message: "This campaign is no longer active"
      });
    }

    // Find or create shop for user
    let shop = await Shop.findOne({ userId });

    console.log('[Save Aston] Shop found:', shop ? 'Yes' : 'No');
    console.log('[Save Aston] Current saved count:', shop ? shop.savedAstons.length : 0);

    if (!shop) {
      shop = new Shop({
        userId,
        savedAstons: []
      });
      console.log('[Save Aston] Created new shop');
    }

    // Check if already saved
    if (shop.isAstonSaved(campaignId)) {
      return res.status(400).json({
        status: false,
        message: "This Aston campaign is already saved to your shop"
      });
    }

    // Find the ASTON placement to get description
    const astonPlacement = brandIntegration.placements?.find(
      p => p.type && p.type.toUpperCase() === 'ASTON'
    );

    // Prepare placement details without the target array (not needed on frontend)
    let placementDetails = {};
    if (astonPlacement) {
      const { target, ...restOfPlacement } = astonPlacement;
      placementDetails = restOfPlacement;
    }
    
    // Prepare Aston data
    const astonData = {
      campaignId: brandIntegration._id,
      brandId: brandIntegration.brandId._id,
      campaignName: brandIntegration.campaignName,
      campaignURL: brandIntegration.campaignURL,
      brandLogoUrl: brandIntegration.brandLogoUrl,
      description: astonPlacement?.description || astonPlacement?.subtitle || "",
      savedAt: new Date(),
      placementDetails
    };

    console.log('[Save Aston] Adding aston data:', astonData.campaignName);

    // Add Aston to shop
    shop.addAston(astonData);
    await shop.save();

    console.log('[Save Aston] Saved successfully. New count:', shop.savedAstons.length);

    // Track the save event
    try {
      const event = new BrandIntegrationEvent({
        eventType: CAMPAIGN_EVENT_TYPES.ASTON_CLICK_SAVE,
        userId: userId,
        sessionId: req.headers['x-session-id'] || 'unknown',
        episodeId: req.body.episodeId || null,
        brandIntegrationId: brandIntegration._id,
        brandId: brandIntegration.brandId._id,
        timestamp: new Date(),
        metadata: {
          action: 'save',
          shopId: shop._id
        }
      });
      await event.save();
    } catch (eventError) {
      console.error('Error tracking save event:', eventError);
      // Don't fail the request if event tracking fails
    }

    return res.status(200).json({
      status: true,
      message: "Aston campaign saved to your shop successfully",
      shop: {
        _id: shop._id,
        totalSaved: shop.totalSaved
      },
      savedAston: astonData
    });

  } catch (error) {
    console.error("Error saving Aston to shop:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error"
    });
  }
};

/**
 * Remove an Aston item from user's shop
 * DELETE /shop/:itemId
 */
exports.removeAston = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { itemId } = req.params;

    console.log('[Remove Aston] userId:', userId);
    console.log('[Remove Aston] itemId:', itemId);

    // Validate input
    if (!itemId) {
      return res.status(400).json({
        status: false,
        message: "itemId is required"
      });
    }

    // Find shop for user
    const shop = await Shop.findOne({ userId });

    console.log('[Remove Aston] Shop found:', shop ? 'Yes' : 'No');
    
    if (!shop) {
      return res.status(404).json({
        status: false,
        message: "Shop not found"
      });
    }

    console.log('[Remove Aston] Current saved count:', shop.savedAstons.length);

    // Find the item to get campaign info before removing
    const itemToRemove = shop.savedAstons.find(
      aston => aston._id.toString() === itemId
    );

    console.log('[Remove Aston] Item to remove found:', itemToRemove ? 'Yes' : 'No');

    if (!itemToRemove) {
      return res.status(404).json({
        status: false,
        message: "Aston item not found in your shop"
      });
    }

    // Remove Aston from shop by item ID
    shop.removeAstonById(itemId);
    await shop.save();

    console.log('[Remove Aston] Removed successfully. New count:', shop.savedAstons.length);

    // Track the remove event
    try {
      const campaignId = itemToRemove.campaignId || itemToRemove.brandIntegrationId;
      
      const event = new BrandIntegrationEvent({
        eventType: CAMPAIGN_EVENT_TYPES.ASTON_CLICK_SAVE,
        userId: userId,
        sessionId: req.headers['x-session-id'] || 'unknown',
        episodeId: null,
        brandIntegrationId: campaignId,
        brandId: itemToRemove.brandId,
        timestamp: new Date(),
        metadata: {
          action: 'remove',
          shopId: shop._id,
          itemId: itemId
        }
      });
      await event.save();
    } catch (eventError) {
      console.error('Error tracking remove event:', eventError);
      // Don't fail the request if event tracking fails
    }

    return res.status(200).json({
      status: true,
      message: "Aston item removed from your shop successfully",
      shop: {
        _id: shop._id,
        totalSaved: shop.totalSaved
      }
    });

  } catch (error) {
    console.error("Error removing Aston from shop:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error"
    });
  }
};

/**
 * Get all saved Astons in user's shop
 * GET /shop/
 */
exports.getSavedAstons = async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      page = 1,
      limit = 20,
      sortBy = 'savedAt',
      sortOrder = 'desc'
    } = req.query;

    console.log('[Get Saved Astons] userId:', userId);

    // Find shop for user
    const shop = await Shop.findOne({ userId }).lean();

    console.log('[Get Saved Astons] Shop found:', shop ? 'Yes' : 'No');
    console.log('[Get Saved Astons] savedAstons count:', shop?.savedAstons?.length || 0);

    if (!shop || !shop.savedAstons || shop.savedAstons.length === 0) {
      return res.status(200).json({
        status: true,
        message: "No saved Astons found",
        totalSaved: 0,
        savedAstons: [],
        pagination: {
          total: 0,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: 0
        }
      });
    }

    // Manually populate brand names
    const Brand = require("../brand/brand.model");
    const brandIds = [...new Set(shop.savedAstons.map(a => a.brandId.toString()))];
    const brands = await Brand.find({ _id: { $in: brandIds } }).select('_id brandName').lean();
    const brandMap = new Map(brands.map(b => [b._id.toString(), b.brandName]));

    // Add brand names to saved Astons and normalize field names
    let savedAstons = shop.savedAstons.map(aston => ({
      _id: aston._id, // Include item ID for removal
      campaignId: aston.campaignId || aston.brandIntegrationId, // Support both old and new field names
      brandId: aston.brandId,
      campaignName: aston.campaignName,
      campaignURL: aston.campaignURL,
      brandLogoUrl: aston.brandLogoUrl,
      description: aston.description,
      savedAt: aston.savedAt,
      placementDetails: aston.placementDetails,
      brandName: brandMap.get(aston.brandId.toString()) || 'Unknown Brand'
    }));
    
    // Sort saved Astons
    savedAstons.sort((a, b) => {
      let compareValue = 0;
      
      if (sortBy === 'savedAt') {
        compareValue = new Date(a.savedAt) - new Date(b.savedAt);
      } else if (sortBy === 'campaignName') {
        compareValue = a.campaignName.localeCompare(b.campaignName);
      }
      
      return sortOrder === 'desc' ? -compareValue : compareValue;
    });

    // Paginate
    const total = savedAstons.length;
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedAstons = savedAstons.slice(startIndex, endIndex);

    // Transform to include isSaved flag
    const transformedAstons = paginatedAstons.map(aston => ({
      ...aston,
      isSaved: true
    }));

    return res.status(200).json({
      status: true,
      message: "Saved Astons fetched successfully",
      totalSaved: shop.totalSaved,
      savedAstons: transformedAstons,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error("Error fetching saved Astons:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error"
    });
  }
};

/**
 * Get shop stats for user
 * GET /shop/stats
 */
exports.getShopStats = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Find shop for user
    const shop = await Shop.findOne({ userId })
      .select('totalSaved createdAt updatedAt')
      .lean();

    if (!shop) {
      return res.status(200).json({
        status: true,
        message: "No saved items yet",
        totalSaved: 0
      });
    }

    return res.status(200).json({
      status: true,
      message: "Shop stats fetched successfully",
      totalSaved: shop.totalSaved,
      createdAt: shop.createdAt,
      updatedAt: shop.updatedAt
    });

  } catch (error) {
    console.error("Error fetching shop stats:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error"
    });
  }
};

/**
 * Check if an Aston is saved in user's shop
 * GET /shop/:campaignId
 */
exports.checkAstonSaved = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { campaignId } = req.params;

    // Validate input
    if (!campaignId) {
      return res.status(400).json({
        status: false,
        message: "campaignId is required"
      });
    }

    // Find shop for user
    const shop = await Shop.findOne({ userId });

    if (!shop) {
      return res.status(200).json({
        status: true,
        isSaved: false
      });
    }

    const isSaved = shop.isAstonSaved(campaignId);

    return res.status(200).json({
      status: true,
      isSaved
    });

  } catch (error) {
    console.error("Error checking if Aston is saved:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error"
    });
  }
};
