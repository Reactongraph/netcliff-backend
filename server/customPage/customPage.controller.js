const CustomPage = require("./customPage.model");
const { deleteCache } = require("../../util/redisUtils");

// Get the custom page config (creates one if it doesn't exist)
exports.getCustomPage = async (req, res) => {
    try {
        // Get type from query parameter, default to 'subscription'
        const pageType = req.query.type || 'subscription';
        const planId = req.query.planId;        

        // Validate type
        const validTypes = ['subscription', 'paymentPlan'];
        if (!validTypes.includes(pageType)) {
            return res.status(400).json({
                status: false,
                message: `Invalid page type. Must be one of: ${validTypes.join(', ')}`
            });
        }

        let customPage = await CustomPage.findOne({ type: pageType, ...(pageType === 'paymentPlan' && planId ? {planId} : {}) }).lean();

        if (!customPage) {
            // Create a new document with the specified type
            const newDoc = new CustomPage({ type: pageType, ...(pageType === 'paymentPlan' && planId ? {planId} : {}) });
            await newDoc.save();
            customPage = newDoc.toObject();
        }

        // Sort Creative
        if (customPage.creative && Array.isArray(customPage.creative)) {
            customPage.creative.sort((a, b) => (a.order || 0) - (b.order || 0));
        }

        // Sort Social Links
        if (customPage.socialLinks && Array.isArray(customPage.socialLinks)) {
            customPage.socialLinks.sort((a, b) => (a.order || 0) - (b.order || 0));
        }

        // Handle Steps: Sort and Conditional Filter
        if (customPage.steps && Array.isArray(customPage.steps)) {
            // Sort first
            customPage.steps.sort((a, b) => (a.order || 0) - (b.order || 0));

            // Filter if not admin
            if (req.query.from !== 'admin') {
                customPage.steps = customPage.steps.filter(step => step.enabled);
            }
        }

        return res.status(200).json({ status: true, message: "Success", data: customPage });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ status: false, message: "Internal Server Error", error: error.message });
    }
};

// Update the custom page config
exports.updateCustomPage = async (req, res) => {
    try {
        // Get type from query parameter or body, default to 'subscription'
        const pageType = req.query.type || req.body.type || 'subscription';
        const planId = req.body.planId;

        // Validate type
        const validTypes = ['subscription', 'paymentPlan'];
        if (!validTypes.includes(pageType)) {
            return res.status(400).json({
                status: false,
                message: `Invalid page type. Must be one of: ${validTypes.join(', ')}`
            });
        }

        let customPage = await CustomPage.findOne({ type: pageType, ...(pageType === 'paymentPlan' && planId ? {planId} : {}) });

        if (!customPage) {
            customPage = new CustomPage({ type: pageType, ...(pageType === 'paymentPlan' && planId ? {planId} : {}) });
        }

        // Update fields from request body
        const fields = ['mainHeading', 'secondaryHeading', 'footerText', 'disclaimerText', 'helpUrl', 'creative', 'steps', 'socialLinks', 'cta', 'selectedPlanId', 'planId', 'showUpiTags'];

        fields.forEach(field => {
            if (req.body[field] !== undefined) {
                customPage[field] = req.body[field];
            }
        });

        await customPage.save();

        // Invalidate cache for this page type
        // Clear both admin and public caches
        try {
            await deleteCache(`/custom-page:type=${pageType}`);
            console.log(`Cache invalidated for custom page type: ${pageType}`);
        } catch (cacheError) {
            console.error('Error invalidating cache:', cacheError);
            // Don't fail the request if cache invalidation fails
        }

        return res.status(200).json({ status: true, message: "Custom Page updated successfully", data: customPage });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ status: false, message: "Internal Server Error", error: error.message });
    }
};
