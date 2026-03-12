const { redisClient } = require('../config/redis');

/**
 * Get data from Redis cache
 * @param {string} key - Redis cache key
 * @returns {Promise<any>} - Cached data or null
 */
const getFromCache = async (key) => {
  try {
    const cachedData = await redisClient.get(key);
    return cachedData ? JSON.parse(cachedData) : null;
  } catch (error) {
    console.error(`Redis get error for key ${key}:`, error);
    return null;
  }
};

/**
 * Store data in Redis cache
 * @param {string} key - Redis cache key
 * @param {any} data - Data to cache
 * @param {number} ttl - Time to live in seconds (defaults to 14400 = 4 hour)
 * @returns {Promise<boolean>} - Success status
 */
const setCache = async (key, data, ttl = process.env.REDIS_TTL || 14400) => {
  try {
    await redisClient.set(key, JSON.stringify(data), { EX: ttl });
    return true;
  } catch (error) {
    console.error(`Redis set error for key ${key}:`, error);
    return false;
  }
};

/**
 * Delete data from Redis cache
 * @param {string} key - Redis cache key
 * @returns {Promise<boolean>} - Success status
 */
const deleteCache = async (key) => {
  try {
    await redisClient.del(key);
    return true;
  } catch (error) {
    console.error(`Redis delete error for key ${key}:`, error);
    return false;
  }
};

/**
 * Check if key exists in Redis cache
 * @param {string} key - Redis cache key
 * @returns {Promise<boolean>} - Whether key exists
 */
const existsInCache = async (key) => {
  try {
    return await redisClient.exists(key) === 1;
  } catch (error) {
    console.error(`Redis exists error for key ${key}:`, error);
    return false;
  }
};

/**
 * Middleware to cache API responses
 * @param {string} prefix - Cache key prefix
 * @param {function} keyGenerator - Function to generate cache key from request (defaults to URL path)
 * @param {number} ttl - Cache TTL in seconds
 * @returns {function} Express middleware
 */
const cacheMiddleware = ({ keyOrGenerator, ttl = process.env.REDIS_TTL || 3600, skipReturn = false }) => {
  return async (req, res, next) => {
    // Skip caching for non-GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Check if Redis is available
    try {
      await redisClient.ping();
    } catch (error) {
      console.log('Redis not available, skipping cache');
      return next();
    }

    let key;
    if (typeof keyOrGenerator === 'string') {
      // If it's a string, use it as prefix with originalUrl
      key = keyOrGenerator;
    } else if (typeof keyOrGenerator === 'function') {
      // If it's a function, call it with req
      key = keyOrGenerator(req);
    } else {
      // If null/undefined, just use originalUrl
      key = req.originalUrl;
    }

    try {
      // Try to get data from cache
      const cachedData = await getFromCache(key);

      if (cachedData) {
        if (skipReturn) {
          req.cachedData = cachedData;
        } else {
          return res.json(cachedData);
        }
      }

      // Store original send function
      const originalSend = res.json;

      // Override res.json to cache the response before sending
      res.json = function (data) {
        // Only cache successful responses (excluding 204 No Content) and if we don't have cached data already
        if (!req.cachedData && res.statusCode >= 200 && res.statusCode < 300 && res.statusCode !== 204) {
          setCache(key, data, ttl).catch(err =>
            console.error(`Failed to cache response for ${key}:`, err)
          );
        }

        // Call the original function
        return originalSend.call(this, data);
      };

      next();
    } catch (error) {
      console.error(`Cache middleware error for ${key}:`, error);
      next();
    }
  };
};

module.exports = {
  getFromCache,
  setCache,
  deleteCache,
  existsInCache,
  cacheMiddleware
};