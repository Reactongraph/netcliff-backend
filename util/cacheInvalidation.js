const { redisClient } = require('../config/redis');

/**
 * Invalidate all cache keys with a specific prefix
 * @param {string} prefix - The prefix to match
 * @returns {Promise<number>} - Number of keys deleted
 */
const invalidateByPrefix = async (prefix) => {
  try {
    let keys = [];
    
    // Use scanIterator which is more reliable in Redis v5
    for await (const key of redisClient.scanIterator({
      MATCH: `${prefix}*`,
      COUNT: 100
    })) {
      keys.push(key);
    }
    
    // Delete all matched keys
    if (keys.length > 0) {
      // Use spread operator to pass keys as individual arguments
      // await redisClient.FLUSHDB('ASYNC')

      await redisClient.del(...keys);

    }
    
    return keys.length;
  } catch (error) {
    console.error(`Error invalidating cache with prefix ${prefix}:`, error);
    return 0;
  }
};

/**
 * Invalidate cache for a specific entity
 * @param {string} entityType - Type of entity (e.g., 'movie', 'genre')
 * @param {string} entityId - ID of the entity
 * @returns {Promise<number>} - Number of keys deleted
 */
const invalidateEntity = async (entityType, entityId) => {
  try {
    return await invalidateByPrefix(`${entityType}:/${entityType}/${entityId}`);
  } catch (error) {
    console.error(`Error invalidating cache for ${entityType} ${entityId}:`, error);
    return 0;
  }
};

/**
 * Invalidate all cache for an entity type
 * @param {string} entityType - Type of entity (e.g., 'movie', 'genre')
 * @returns {Promise<number>} - Number of keys deleted
 */
const invalidateEntityType = async (entityType) => {
  try {
    return await invalidateByPrefix(`${entityType}:`);
  } catch (error) {
    console.error(`Error invalidating cache for ${entityType}:`, error);
    return 0;
  }
};

/**
 * Invalidate related entity caches
 * For example, when a movie is updated, also invalidate related genres, actors, etc.
 * @param {string} entityType - Primary entity type
 * @param {string} entityId - ID of the primary entity
 * @param {Array<string>} relatedTypes - Array of related entity types
 * @returns {Promise<Object>} - Results of invalidation
 */
const invalidateRelated = async (entityType, entityId, relatedTypes) => {
  const results = {
    primary: 0,
    related: {}
  };
  
  try {
    // Invalidate primary entity
    results.primary = await invalidateEntity(entityType, entityId);
    
    // Invalidate related entity types
    for (const type of relatedTypes) {
      results.related[type] = await invalidateEntityType(type);
    }
    
    return results;
  } catch (error) {
    console.error(`Error invalidating related caches for ${entityType} ${entityId}:`, error);
    return results;
  }
};

module.exports = {
  invalidateByPrefix,
  invalidateEntity,
  invalidateEntityType,
  invalidateRelated
};