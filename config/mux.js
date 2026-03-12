const Mux = require('@mux/mux-node');

// Regular Mux client for standard operations
const muxClient = new Mux({
  tokenId: process.env.MUX_TOKEN_ID,
  tokenSecret: process.env.MUX_TOKEN_SECRET
});

// DRM-specific Mux client for DRM operations
const muxDrmClient = new Mux({
  tokenId: process.env.MUX_DRM_TOKEN_ID,
  tokenSecret: process.env.MUX_DRM_TOKEN_SECRET
});

module.exports = {
  muxClient,
  muxDrmClient
}; 