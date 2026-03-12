const mongoose = require('mongoose');


const tvChannelsModel = require('./tvChannels.model');
const { recordStatus } = require('../../util/helper');
const streamModel = require('../stream/stream.model');

exports.create = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // Validate required fields (only name and description are required)
    if (!req.body.name || !req.body.description) {
      return res.status(200).json({
        status: false,
        message: "Please provide name and description"
      });
    }

    // Create channel object with required fields
    const channelData = {
      name: req.body.name,
      description: req.body.description,
    };

    // Create new TV Channel
    const tvChannel = new tvChannelsModel(channelData);

    // Save the TV Channel
    await tvChannel.save();

    // If channels (streams) are provided, update them
    if (req.body.channels && Array.isArray(req.body.channels)) {
      // Update all provided streams to include this TV channel
      await streamModel.updateMany(
        {
          _id: { $in: req.body.channels }
        },
        {
          $addToSet: { tvChannels: tvChannel._id }
        },
        { session }
      );
    }

    await session.commitTransaction();

    // Populate the references for the response (if they exist)
    const populatedChannel = await tvChannelsModel.aggregate([
      {
        $match: {
          _id: tvChannel._id
        }
      },
      {
        $lookup: {
          from: 'streams',
          localField: '_id',
          foreignField: 'tvChannels',
          as: 'channels',
          pipeline: [
            {
              $project: {
                _id: 1,
                channelName: 1
              }
            }
          ]
        }
      },
    ])

    res.status(200).json({
      status: true,
      message: "TV Channel created successfully!",
      channel: populatedChannel[0]
    });

  } catch (error) {
    await session.abortTransaction();
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error!!"
    });
  } finally {
    // End the session
    session.endSession();
  }
};


exports.get = async (req, res) => {
  try {
    if (!req.query.start || !req.query.limit)
      return res
        .status(200)
        .json({ status: false, message: "Oops! Invalid details." });

    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 10;

    const countPromise = tvChannelsModel.countDocuments({ status: { $ne: recordStatus.DELETED } })

    const tvChannelsPromise = tvChannelsModel.aggregate([
      {
        $match: {
          status: { $ne: recordStatus.DELETED }  // filter out deleted channels
        }
      },
      {
        $sort: { createdAt: -1 }
      },
      { $skip: (start - 1) * limit },
      { $limit: limit },
      {
        $lookup: {
          from: 'streams',
          localField: '_id',
          foreignField: 'tvChannels',
          as: 'channels',
          pipeline: [
            {
              $project: {
                _id: 1,
                channelName: 1
              }
            }
          ]
        }
      },
    ]);

    const [totalChannels, tvChannels] = await Promise.all([countPromise, tvChannelsPromise])
    return res.status(200).json({
      status: true,
      message: "All liveTV related data has been get added by Admin!",
      tvChannels,
      totalChannels
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error",
    });
  }
};

exports.getForUsers = async (req, res) => {
  try {

    const { categoryId, start: reqStart, limit: reqLimit } = req.query;
    const start = reqStart ? parseInt(reqStart) : 1;
    const limit = reqLimit ? parseInt(reqLimit) : 10;

    const pipeline = [];

    pipeline.push(
      {
        $match: {
          status: recordStatus.ACTIVE  // Only active channels
        }
      },
      {
        $sort: { createdAt: -1 }
      },
      {
        $lookup: {
          from: 'streams',
          localField: '_id',
          foreignField: 'tvChannels',
          as: 'channels',
          pipeline: [
            // category filter
            ...(categoryId ? [{
              $match: {
                category: new mongoose.Types.ObjectId(categoryId)
              }
            }] : []),
            // Waiting INTERNAL TYPE stream to complete the source building
            {
              $addFields: {
                isValid: {
                  $cond: {
                    if: { $eq: ["$streamType", "INTERNAL"] },
                    then: {
                      $and: [
                        { $ne: [{ $ifNull: ["$awsChannelId", null] }, null] },
                        { $ne: ["$awsChannelId", ""] }
                      ]
                    },
                    else: true
                  }
                }
              }
            },
            {
              $match: {
                isValid: true
              }
            },
            {
              $project: {
                _id: 1,
                channelName: 1,
                description: 1,
                programs: 1,
                streamURL: 1,
                country: 1,
                channelLogo: 1,
                category: 1,
                language: 1,
              }
            },
            // fetching programs for the stream
            {
              $lookup: {
                from: 'programs',
                localField: '_id',
                foreignField: 'streamId',
                as: 'programs',
                pipeline: [
                  {
                    $match: {
                      start: { $gt: new Date() }
                    }
                  },
                  {
                    $sort: { start: 1 }
                  },
                  {
                    $limit: 8
                  },
                  {
                    $project: {
                      _id: 1,
                      title: 1,
                      description: 1,
                      start: 1,
                      end: 1,
                      allDay: 1,
                    }
                  }
                ]
              }
            }
          ]
        }
      },
      // Filter out channels with empty liveStreams array
      {
        $match: {
          liveStreams: { $ne: [] }
        }
      },
      { $skip: (start - 1) * limit },
      { $limit: limit }
    );

    const tvChannels = await tvChannelsModel.aggregate(pipeline);

    return res.status(200).json({
      status: true,
      message: "TV Channels fetched successfully!",
      tvChannels,
      pagination: {
        hasMore: tvChannels.length >= limit,
        currentStart: start,
        limit,
      }
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error",
    });
  }
};

exports.update = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // Check if tvChannelId is provided
    if (!req.query.tvChannelId) {
      return res.status(200).json({
        status: false,
        message: "Tv Channel ID is required!"
      });
    }


    // Find the TV channel
    const tvChannel = await tvChannelsModel.findById(req.query.tvChannelId);
    if (!tvChannel) {
      return res.status(200).json({
        status: false,
        message: "TV Channel not found!"
      });
    }

    const updateData = {};

    if (req.body.name)
      updateData.name = req.body.name;
    if (req.body.description)
      updateData.description = req.body.description;
    if (req.body.status)
      updateData.status = req.body.status;

    // Handle stream associations if channels are provided
    if (req.body.channels) {
      // Validate channels is an array
      if (!Array.isArray(req.body.channels)) {
        return res.status(200).json({
          status: false,
          message: "channels must be an array"
        });
      }

      // First, remove this TV channel from all streams that previously had it
      await streamModel.updateMany(
        { tvChannels: req.query.tvChannelId },
        { $pull: { tvChannels: req.query.tvChannelId } },
        { session }
      );

      // Then add this TV channel to the new set of streams
      await streamModel.updateMany(
        { _id: { $in: req.body.channels } },
        { $addToSet: { tvChannels: req.query.tvChannelId } },
        { session }
      );
    }

    await session.commitTransaction();

    // Update the TV Channel
    const updatedChannel = await tvChannelsModel.aggregate([
      {
        $match: {
          _id: mongoose.Types.ObjectId(req.query.tvChannelId)
        }
      },
      {
        $lookup: {
          from: 'streams',
          localField: '_id',
          foreignField: 'tvChannels',
          as: 'channels',
          pipeline: [
            {
              $project: {
                _id: 1,
                channelName: 1
              }
            }
          ]
        }
      },
    ])

    return res.status(200).json({
      status: true,
      message: "TV Channel updated successfully!",
      channel: updatedChannel[0]
    });

  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error"
    });
  }
};

exports.destroy = async (req, res) => {
  try {
    if (!req.query.tvChannelId) {
      return res.status(200).json({
        status: false,
        message: "Channel ID is required!"
      });
    }

    const channel = await tvChannelsModel.findById(req.query.tvChannelId);
    if (!channel) {
      return res.status(200).json({
        status: false,
        message: "TV Channel not found!"
      });
    }

    // Update status 
    const updatedChannel = await tvChannelsModel.findByIdAndUpdate(
      req.query.tvChannelId,
      {
        status: recordStatus.DELETED
      },
      { new: true }
    );

    return res.status(200).json({
      status: true,
      message: "TV Channel deleted successfully!",
      channel: updatedChannel
    });

  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error"
    });
  }
};

