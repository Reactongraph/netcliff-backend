const { createCluster, createClient } = require('redis');
const dotenv = require('dotenv');

dotenv.config();

// Create Redis cluster client
const redisClient = createClient({
  rootNodes: [{
    url: `rediss://${process.env.REDIS_HOST}`
  }],
  defaults: {
    password: process.env.REDIS_PASSWORD,
    socket: {
      tls: true,
    }
  }
});

// Handle Redis errors
redisClient.on('error', (err) => {
  console.error('Redis Client Error:', err);
});

// Redis connection
const connectRedis = async () => {
  try {
    await redisClient.connect();
    console.log('REDIS: Successfully connected to Redis');

  } catch (error) {
    console.error('REDIS: Failed to connect to Redis:', error);
  }
};

module.exports = {
  redisClient,
  connectRedis
}; 