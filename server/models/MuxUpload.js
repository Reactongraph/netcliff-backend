const mongoose = require('mongoose');

const muxUploadSchema = new mongoose.Schema({
  uploadId: {
    type: String,
    required: true,
    unique: true
  },
  playbackId: String,
  status: {
    type: String,
    enum: ['pending', 'ready', 'error'],
    default: 'pending'
  },
  error: String,
  drmEnabled: {
    type: Boolean,
    default: false
  },
  duration: Number,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('MuxUpload', muxUploadSchema); 