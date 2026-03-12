const recombee = require('recombee-api-client');

const db = process.env.RECOMBEE_DB
const privateToken = process.env.RECOMBEE_PRIVATE_TOKEN
const region = process.env.RECOMBEE_REGION

if (!db || !privateToken) {
  console.warn('[Recombee] Missing RECOMBEE_DB or RECOMBEE_PRIVATE_TOKEN environment variables.');
}

const r = recombee.requests;
const client = new recombee.ApiClient(db, privateToken, { region });

// Add movie to Recombee database
const addMovie = async (movieId, movieData) => {
  try {
    const batch = [
      new r.AddItem(movieId),
      new r.SetItemValues(movieId, {
        title: movieData.title || null,
        releaseYear: movieData.releaseYear || null,
        regionNames: movieData.regionNames || [],
        genreNames: movieData.genreNames || [],
        languageNames: movieData.languageNames || [],
        tagNames: movieData.tagNames || [],
        maturity: movieData.maturity || null,
        contentRating: Number.isFinite(movieData.contentRating) ? Math.round(Number(movieData.contentRating)) : null,
        exclusive: !!movieData.exclusive,
        featured: !!movieData.featured,
        newReleased: !!movieData.newReleased,
        runtime: Number.isFinite(movieData.runtime) ? Math.round(Number(movieData.runtime)) : null,
        view: Number.isFinite(movieData.view) ? movieData.view : 0,
      }, { cascadeCreate: true })
    ];

    await client.send(new r.Batch(batch));
    return { success: true };
  } catch (error) {
    console.error('Error adding movie to Recombee:', error?.message);
    return { success: false, error: error.message };
  }
};

// Add user interaction (view, like, etc.)
const addInteraction = async (userId, movieId, interactionType = 'view', rating = null, timestamp = null, duration = null) => {
  try {
    const detailViewOptions = { cascadeCreate: true, timestamp };
    if (duration !== null && duration > 0) detailViewOptions.duration = Math.round(duration);

    const interaction = rating
      ? new r.AddRating(userId, movieId, rating, { cascadeCreate: true, timestamp })
      : new r.AddDetailView(userId, movieId, detailViewOptions);

    await client.send(interaction);
    return { success: true };
  } catch (error) {
    console.error('Error adding interaction to Recombee:', error?.message);
    return { success: false, error: error.message };
  }
};

// Get recommendations for user
const getRecommendations = async (userId, count = 10, scenario = 'home') => {
  try {
    const recommendations = await client.send(
      new r.RecommendItemsToUser(userId, count, {
        scenario: scenario,
        cascadeCreate: false,
        returnProperties: false,
        diversity: 0.15,
        minRelevance: 'low'
      })
    );
    return { success: true, data: recommendations };
  } catch (error) {
    console.error('Error getting recommendations:', error?.message);
    return { success: false, error: error.message };
  }
};

// Get similar movies
const getSimilarMovies = async (movieId, count = 10) => {
  try {
    const similar = await client.send(
      new r.RecommendItemsToItem(movieId, count, {
        returnProperties: false,
        diversity: 0.1
      })
    );
    return { success: true, data: similar };
  } catch (error) {
    console.error('Error getting similar movies:', error?.message);
    return { success: false, error: error.message };
  }
};

// Batch operations for efficiency
const batchAddMovies = async (movies) => {
  try {
    const batch = [];
    for (const movie of movies) {
      // Use SetItemValues with cascadeCreate instead of AddItem to handle existing items
      batch.push(new r.SetItemValues(movie.id, movie.data, { cascadeCreate: true }));
    }
    const result = await client.send(new r.Batch(batch));
    return { success: true };
  } catch (error) {
    console.error('Error details:', error.response?.data || error.message);
    return { success: false, error: error.message };
  }
};

// Add user to Recombee - helper function that extracts data from user object
// This centralizes the field mapping so it's easy to add/remove fields
const addUser = async (user) => {
  try {
    if (!user || !user._id) {
      console.error('Invalid user object provided to addUser');
      return { success: false, error: 'Invalid user object' };
    }

    const userId = user._id.toString();

    // Only sync in production environment
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Recombee] Skipping user sync - not in production, userId: ${userId}`);
      return { success: true, skipped: true };
    }

    // Only sync premium users
    if (!user.isPremiumPlan) {
      console.log(`[Recombee] Skipping user sync - not premium user, userId: ${userId}`);
      return { success: true, skipped: true };
    }

    // Check if user has valid plan dates and duration >= 15 days
    if (!user.plan?.planStartDate || !user.plan?.planEndDate) {
      console.log(`[Recombee] Skipping user sync - missing plan dates, userId: ${userId}`);
      return { success: true, skipped: true };
    }

    const planDuration = new Date(user.plan.planEndDate) - new Date(user.plan.planStartDate);
    const fifteenDaysInMs = 15 * 24 * 60 * 60 * 1000;
    
    if (planDuration < fifteenDaysInMs) {
      console.log(`[Recombee] Skipping user sync - plan duration less than 15 days, userId: ${userId}`);
      return { success: true, skipped: true };
    }

    console.log(`[Recombee] Syncing user to Recombee, userId: ${userId}`);

    const batch = [
      new r.AddUser(userId),
      new r.SetUserValues(userId, {
        city: user.city || null,
        countrySubdivision: user.countrySubdivision || null
      }, { cascadeCreate: true })
    ];

    await client.send(new r.Batch(batch));
    return { success: true };
  } catch (error) {
    console.error('Error adding user to Recombee:', error?.message);
    return { success: false, error: error.message };
  }
};

const addUsers = async (users) => {
  try {
    // Only sync in production environment
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Recombee] Skipping users sync - not in production');
      return { success: true, skipped: true };
    }

    const requests = [];
    const fifteenDaysInMs = 15 * 24 * 60 * 60 * 1000;
    let validUsers = 0;
    let skippedUsers = 0;
    
    for (const user of users) {
      const userId = user._id.toString();
      
      // Only sync premium users with valid long-term plans
      if (!user.isPremiumPlan || !user.plan?.planStartDate || !user.plan?.planEndDate) {
        console.log(`[Recombee] Skipping user - not premium or missing plan dates, userId: ${userId}`);
        skippedUsers++;
        continue;
      }
      
      const planDuration = new Date(user.plan.planEndDate) - new Date(user.plan.planStartDate);
      if (planDuration < fifteenDaysInMs) {
        console.log(`[Recombee] Skipping user - plan duration less than 15 days, userId: ${userId}`);
        skippedUsers++;
        continue;
      }
      
      console.log(`[Recombee] Adding user to batch, userId: ${userId}`);
      validUsers++;
      
      requests.push(new r.SetUserValues(userId, {
        city: user.city || null,
        countrySubdivision: user.countrySubdivision || null,
      }, { cascadeCreate: true }));
    }
    
    console.log(`[Recombee] Batch summary - Valid users: ${validUsers}, Skipped users: ${skippedUsers}`);
    
    if (requests.length === 0) {
      console.log('[Recombee] No valid users to sync');
      return { success: true, skipped: true };
    }
    
    await client.send(new r.Batch(requests));
    return { success: true };
  } catch (error) {
    console.error('Error adding premium users to Recombee:', error?.message);
    return { success: false, error: error.message };
  }
};

// Get popular/trending items (fallback for recommendations)
const getPopularItems = async (userId, count = 10) => {
  try {
    const popular = await client.send(
      new r.RecommendItemsToUser(userId, count, {
        scenario: 'popular',
        returnProperties: false,
        diversity: 0.2,
        minRelevance: 'low'
      })
    );
    return { success: true, data: popular };
  } catch (error) {
    console.error('Error getting popular items:', error?.message);
    return { success: false, error: error.message };
  }
};

// Get next recommendations for pagination
const getNextRecommendations = async (recommId, count = 10) => {
  try {
    console.log('recommId', recommId)
    const nextRecommendations = await client.send(
      new r.RecommendNextItems(recommId, count)
    );
    return { success: true, data: nextRecommendations };
  } catch (error) {
    console.error('Error getting next recommendations:', error?.message);
    return { success: false, error: error.message };
  }
};

// Set view portion
const setViewPortion = async (userId, movieId, portion) => {
  try {
    await client.send(
      new r.SetViewPortion(userId, movieId, portion, { cascadeCreate: true })
    );
    return { success: true };
  } catch (error) {
    console.error('Error setting view portion:', error?.message);
    return { success: false, error: error.message };
  }
};

// Add bookmark
const addBookmark = async (userId, movieId) => {
  try {
    // Only sync in production environment
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Recombee] Skipping bookmark add - not in production, userId: ${userId}`);
      return { success: true, skipped: true };
    }

    await client.send(
      new r.AddBookmark(userId, movieId, { cascadeCreate: true })
    );
    return { success: true };
  } catch (error) {
    console.error('Error adding bookmark: recombee:', error?.message);
    return { success: false, error: error.message };
  }
};

// Delete bookmark
const deleteBookmark = async (userId, movieId) => {
  try {
    // Only sync in production environment
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Recombee] Skipping bookmark delete - not in production, userId: ${userId}`);
      return { success: true, skipped: true };
    }

    await client.send(
      new r.DeleteBookmark(userId, movieId)
    );
    return { success: true };
  } catch (error) {
    console.error('Error deleting bookmark: recombee:', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  addMovie,
  addInteraction,
  getRecommendations,
  getSimilarMovies,
  getPopularItems,
  getNextRecommendations,
  batchAddMovies,
  addUser,
  addUsers,
  setViewPortion,
  addBookmark,
  deleteBookmark
};