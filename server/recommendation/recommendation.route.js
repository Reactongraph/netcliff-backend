const express = require('express');
const router = express.Router();
const recommendationController = require('./recommendation.controller');
const { setupRecombeeDatabase } = require('../scripts/recombee-setup');
const { syncMoviesToRecombee } = require('../scripts/sync-movies');
const { firebaseAuthenticate, authorize } = require('../middleware/auth.middleware');
const { userRoles } = require('../../util/helper');
const { cacheMiddleware } = require('../../util/redisUtils');

// Get user recommendations
router.get(
  '/user',
  firebaseAuthenticate,
  authorize([userRoles.USER]),
  cacheMiddleware({
    keyOrGenerator: (req) => {
      const userId = req.user?.userId;
      const page = req.query.page || 1;
      const perPage = req.query.perPage || 10;
      return `recommendations:user:${userId}:page:${page}:perPage:${perPage}`;
    },
    ttl: 1800 // Cache for 24 hours
  }),
  recommendationController.getUserRecommendations
);

// Get popular recommendations for search page
router.get(
  '/popular',
  // firebaseAuthenticate,
  // authorize([userRoles.USER]),
  cacheMiddleware({
    keyOrGenerator: (req) => {
      return `recommendations:popular`;
    },
    ttl: 86400 // Cache for 24 hours
  }),
  recommendationController.getPopularRecommendations
);

// Get similar movies
router.get('/similar/:movieId', recommendationController.getSimilarMovies);

// Track user interaction
router.post('/track/:userId/:movieId', recommendationController.trackInteraction);

// Admin route to get user recommendations
router.post('/admin/user-recommendations', recommendationController.getAdminUserRecommendations);

// Setup Recombee database
router.post('/setup-recombee', async (req, res) => {
  try {
    await setupRecombeeDatabase();
    res.json({ status: true, message: 'Recombee database setup completed' });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
});

// Sync movies to Recombee
router.post('/sync-movies', async (req, res) => {
  try {
    await syncMoviesToRecombee();
    res.json({ status: true, message: 'Movies synced to Recombee successfully' });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
});

module.exports = router;