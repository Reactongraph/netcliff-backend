const Stream = require("../stream/stream.model");
const ProgramModel = require("./program.model");

const mongoose = require("mongoose");

//deleteFromAzure
const { deleteFromAzure } = require("../../util/deleteFromAzure");
const { formatStackName } = require("../../util/helper");
const favoriteStreamModel = require("./favoriteStream.model");
const { S3, CloudFormation, MediaLive } = require("../../util/awsServices");

async function emptyS3Bucket(bucketName) {
  try {
    // First list all objects in the bucket
    const listParams = {
      Bucket: bucketName,
    };

    const listedObjects = await S3.listObjectVersions(listParams).promise();

    if (
      listedObjects.Versions.length === 0 &&
      listedObjects.DeleteMarkers.length === 0
    )
      return;

    const deleteParams = {
      Bucket: bucketName,
      Delete: { Objects: [] },
    };

    // Add all versions and delete markers to be deleted
    [...listedObjects.Versions, ...listedObjects.DeleteMarkers].forEach(
      ({ Key, VersionId }) => {
        deleteParams.Delete.Objects.push({ Key, VersionId });
      }
    );

    // Delete all objects
    await S3.deleteObjects(deleteParams).promise();

    // If there might be more objects, delete them too
    if (listedObjects.IsTruncated) await emptyS3Bucket(bucketName);
  } catch (error) {
    console.log(`Error emptying bucket ${bucketName}:`, error);
    throw error;
  }
}

//create channel by admin if isIptvAPI switch on (true)
exports.Store = async (req, res) => {
  try {
    if (
      req.body.channelId &&
      req.body.channelName &&
      req.body.channelLogo &&
      req.body.description &&
      req.body.streamURL
    ) {
      // const channelExist = await Stream.findOne({
      //   channelId: req.body.channelId,
      // });
      // if (channelExist) {
      //   return res.status(200).json({
      //     status: false,
      //     message: "This Channel already exists! ",
      //   });
      // }

      const stream = new Stream();
      stream.streamURL = req.body.streamURL;
      stream.channelId = req.body.channelId;
      stream.channelName = req.body.channelName;
      stream.channelLogo = req.body.channelLogo;
      stream.description = req.body.description;
      stream.streamType = req.body.streamType;

      if (req.body.tvChannels) {
        // Validate liveStreams is an array if provided
        if (!Array.isArray(req.body.tvChannels)) {
          return res.status(200).json({
            status: false,
            message: "Tv channels must be an array",
          });
        }
        stream.tvChannels = req.body.tvChannels;
      }

      // Filter
      if (req.body.category) stream.category = req.body.category;
      if (req.body.language) stream.language = req.body.language;

      //Geography
      if (req.body.continent) stream.continent = req.body.continent;
      if (req.body.country) stream.country = req.body.country;
      if (req.body.city) stream.city = req.body.city;

      await stream.save();

      return res.status(200).json({
        status: true,
        message: "Channel Created!",
        stream,
      });
    } else {
      return res
        .status(200)
        .json({ status: false, message: "Oops ! Invalid details!" });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error",
    });
  }
};

//create manual channel by admin
exports.manualStore = async (req, res) => {
  try {
    if (
      !req.body.channelName ||
      !req.body.channelLogo ||
      !req.body.description ||
      !req.body.streamType
    )
      return res
        .status(200)
        .json({ status: false, message: "Oops ! Invalid details!!" });

    // Additional validation for EXTERNAL streamType
    if (req.body.streamType === "EXTERNAL")
      if (!req.body.streamURL) {
        return res.status(200).json({
          status: false,
          message: "Stream URL is required for external streams!",
        });
      }

    let stackId = "";
    const stream = new Stream();
    stream.channelName = req.body.channelName;
    stream.channelLogo = req.body.channelLogo;
    stream.description = req.body.description;
    stream.streamType = req.body.streamType;

    if (req.body.tvChannels) {
      // Validate liveStreams is an array if provided
      if (!Array.isArray(req.body.tvChannels)) {
        return res.status(200).json({
          status: false,
          message: "Tv channels must be an array",
        });
      }
      stream.tvChannels = req.body.tvChannels;
    }

    // Filter
    if (req.body.category) stream.category = req.body.category;
    if (req.body.language) stream.language = req.body.language;

    //Geography
    if (req.body.continent) stream.continent = req.body.continent;
    if (req.body.country) stream.country = req.body.country;
    if (req.body.city) stream.city = req.body.city;

    if (req.body.streamType === "EXTERNAL")
      stream.streamURL = req.body.streamURL;

    if (req.body.streamType === "INTERNAL") {
      // Init live stream cloud formation on aws
      console.log("Live tv build initialized");
      const stackName = formatStackName(req.body.channelName);
      const params = {
        StackName: stackName,
        TemplateURL:
          "https://s3.amazonaws.com/solutions-reference/live-streaming-on-aws/latest/live-streaming-on-aws.template",
        Capabilities: ["CAPABILITY_NAMED_IAM"],
        Parameters: [
          {
            ParameterKey: "InputCIDR",
            ParameterValue: "0.0.0.0/0", // Replace with your desired CIDR block
          },
          {
            ParameterKey: "InputType",
            ParameterValue: "RTMP_PUSH", // Replace with your desired input type
          },
        ],
      };

      const response = await CloudFormation.createStack(params).promise();
      stackId = response.StackId;

      // aws stack Id for live stream cloudformation info
      stream.awsStackId = stackId;
    }

    await stream.save();

    res.status(200).json({
      status: true,
      message: "Channel Created by admin!",
      stream,
    });

    try {
      if (req.body.streamType === "INTERNAL" && stackId) {
        console.log("Wait for Live tv build completion");
        //Background checking for aws for stack formation
        await CloudFormation
          .waitFor("stackCreateComplete", { StackName: stackId })
          .promise();

        // Fetch stack details
        const stackDetails = await CloudFormation
          .describeStacks({ StackName: stackId })
          .promise();

        // Get stack resources
        const stackResources = await CloudFormation
          .listStackResources({
            StackName: stackId,
          })
          .promise();

        console.log("stackResources", JSON.stringify(stackResources));
        // Find MediaLive Channel and Input resources
        const mediaLiveChannel = stackResources.StackResourceSummaries.find(
          (resource) => resource.LogicalResourceId === "MediaLiveChannel"
        );

        const mediaLiveInput = stackResources.StackResourceSummaries.find(
          (resource) => resource.LogicalResourceId === "MediaLiveInput"
        );

        console.log("mediaLiveChannel", JSON.stringify(mediaLiveChannel));
        console.log("mediaLiveInput", JSON.stringify(mediaLiveInput));

        // Fetch outputs
        const outputs = stackDetails.Stacks[0].Outputs;

        const outputObj = outputs.reduce((acc, output) => {
          acc[output.OutputKey] = output.OutputValue;
          return acc;
        }, {});

        // According to convention after last /, string will be stream key!
        const url = outputObj.MediaLivePrimaryEndpoint;

        const lastSlashIndex = url.lastIndexOf("/");
        const streamPublishUrl = url.substring(0, lastSlashIndex) + "/";
        const streamKey = url.substring(lastSlashIndex + 1);

        await Stream.findByIdAndUpdate(stream._id, {
          streamURL: outputObj.CloudFrontHlsEndpoint,
          streamPublishUrl,
          streamKey,
          awsChannelId: mediaLiveChannel?.PhysicalResourceId,
          awsInputId: mediaLiveInput?.PhysicalResourceId,
        });
      }
    } catch (err) {
      console.log("err", err);
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error!!",
    });
  }
};

// Add this to your stream aggregation pipeline
// {
//   $lookup: {
//     from: 'favoritestreams',
//     let: { streamId: '$_id' },
//     pipeline: [
//       {
//         $match: {
//           $expr: {
//             $and: [
//               { $eq: ['$streamId', '$$streamId'] },
//               { $eq: ['$userId', new mongoose.Types.ObjectId(req.user._id)] }
//             ]
//           }
//         }
//       }
//     ],
//     as: 'favorite'
//   }
// },
// {
//   $addFields: {
//     isFavorite: {
//       $cond: {
//         if: { $gt: [{ $size: '$favorite' }, 0] },
//         then: true,
//         else: false
//       }
//     }
//   }
// },
// {
//   $project: {
//     favorite: 0
//   }
// }

//get channel related data added by admin if isIptvAPI switch on (true)
exports.get = async (req, res) => {
  try {
    const {
      categoryId,
      regionId: continentId,
      start: reqStart,
      limit: reqLimit,
    } = req.query;
    const start = reqStart ? parseInt(reqStart) : 1;
    const limit = reqLimit ? parseInt(reqLimit) : 10;

    console.log("continentId", continentId);

    const currentDate = new Date();
    const pipeline = [];

    const matchStage = {};
    if (categoryId)
      matchStage.category = new mongoose.Types.ObjectId(categoryId);

    if (continentId)
      matchStage.continent = new mongoose.Types.ObjectId(continentId);

    pipeline.push({ $match: matchStage });

    pipeline.push(
      {
        $sort: { createdAt: -1 },
      },
      {
        $addFields: {
          isValid: {
            $cond: {
              if: { $eq: ["$streamType", "INTERNAL"] },
              then: {
                $and: [
                  { $ne: [{ $ifNull: ["$awsChannelId", null] }, null] },
                  { $ne: ["$awsChannelId", ""] },
                ],
              },
              else: true,
            },
          },
        },
      },
      {
        $match: {
          isValid: true,
        },
      },
      { $skip: (start - 1) * limit },
      { $limit: limit },
      {
        $lookup: {
          from: "programs",
          let: { streamId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$streamId", "$$streamId"] },
                start: { $gt: currentDate },
              },
            },
            {
              $sort: { start: 1 },
            },
            {
              $limit: 8,
            },
            {
              $project: {
                _id: 1,
                title: 1,
                description: 1,
                start: 1,
                end: 1,
                allDay: 1,
              },
            },
          ],
          as: "programs",
        },
      }
    );

    const stream = await Stream.aggregate(pipeline);

    return res.status(200).json({
      status: true,
      message: "All liveTV!",
      stream,
      pagination: {
        hasMore: stream.length >= limit,
        currentStart: start,
        limit,
      },
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error",
    });
  }
};

exports.getTvChannelsClusters = async (req, res) => {
  try {
    const {
      categoryId,
      languageId,
      regionId: continentId,
      countryId,
      cityId,
      start: reqStart,
      limit: reqLimit,
    } = req.query;
    const start = reqStart ? parseInt(reqStart) : 1;
    const limit = reqLimit ? parseInt(reqLimit) : 10;
    const currentDate = new Date();

    // Base match condition
    const matchStage = {};
    if (categoryId)
      matchStage.category = new mongoose.Types.ObjectId(categoryId);
    if (languageId)
      matchStage.language = new mongoose.Types.ObjectId(languageId);
    if (continentId)
      matchStage.continent = new mongoose.Types.ObjectId(continentId);
    if (countryId) matchStage.country = new mongoose.Types.ObjectId(countryId);
    if (cityId) matchStage.city = new mongoose.Types.ObjectId(cityId);

    const pipeline = [
      {
        $facet: {
          // Pipeline for TV Channels with their streams
          channels: [
            { $match: matchStage },
            {
              $addFields: {
                isValid: {
                  $cond: {
                    if: { $eq: ["$streamType", "INTERNAL"] },
                    then: {
                      $and: [
                        { $ne: [{ $ifNull: ["$awsChannelId", null] }, null] },
                        { $ne: ["$awsChannelId", ""] },
                      ],
                    },
                    else: true,
                  },
                },
              },
            },
            {
              $match: {
                isValid: true,
              },
            },
            {
              $lookup: {
                from: "programs",
                let: { streamId: "$_id" },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $eq: ["$streamId", "$$streamId"] },
                          { $gt: ["$start", currentDate] },
                        ],
                      },
                    },
                  },
                  { $sort: { start: 1 } },
                  { $limit: 8 },
                  {
                    $project: {
                      _id: 1,
                      title: 1,
                      description: 1,
                      start: 1,
                      end: 1,
                      allDay: 1,
                    },
                  },
                ],
                as: "programs",
              },
            },
            {
              $lookup: {
                from: "tvchannels",
                localField: "tvChannels",
                foreignField: "_id",
                as: "tvChannelDetails",
              },
            },
            { $unwind: "$tvChannelDetails" },
            {
              $group: {
                _id: "$tvChannelDetails._id",
                tvChannelName: { $first: "$tvChannelDetails.name" },
                tvChannelDescription: {
                  $first: "$tvChannelDetails.description",
                },
                tvChannelCreatedAt: { $first: "$tvChannelDetails.createdAt" },
                streams: {
                  $push: {
                    _id: "$_id",
                    streamType: "$streamType",
                    channelName: "$channelName",
                    streamURL: "$streamURL",
                    channelLogo: "$channelLogo",
                    programs: "$programs",
                  },
                },
              },
            },
            { $sort: { channelCreatedAt: 1 } },
            { $skip: (start - 1) * limit },
            { $limit: limit + 1 },
          ],
          // Pipeline for Programs (runs in parallel)
          // 'programs': [
          //   { $match: matchStage },
          //   {
          //     $addFields: {
          //       isValid: {
          //         $cond: {
          //           if: { $eq: ["$streamType", "INTERNAL"] },
          //           then: {
          //             $and: [
          //               { $ne: [{ $ifNull: ["$awsChannelId", null] }, null] },
          //               { $ne: ["$awsChannelId", ""] }
          //             ]
          //           },
          //           else: true
          //         }
          //       }
          //     }
          //   },
          //   {
          //     $match: {
          //       isValid: true
          //     }
          //   },
          //   {
          //     $lookup: {
          //       from: 'programs',
          //       let: { streamId: '$_id' },
          //       pipeline: [
          //         {
          //           $match: {
          //             $expr: {
          //               $and: [
          //                 { $eq: ['$streamId', '$$streamId'] },
          //                 { $gt: ['$start', currentDate] }
          //               ]
          //             }
          //           }
          //         },
          //         { $sort: { start: 1 } },
          //         { $limit: 8 },
          //         {
          //           $project: {
          //             _id: 1,
          //             title: 1,
          //             description: 1,
          //             start: 1,
          //             end: 1,
          //             allDay: 1,
          //           }
          //         }
          //       ],
          //       as: 'programs'
          //     }
          //   },
          //   {
          //     $project: {
          //       _id: 1,
          //       programs: 1
          //     }
          //   }
          // ]
        },
      },
    ];

    const [result] = await Stream.aggregate(pipeline);

    // Process results
    const channels = result.channels;
    const programs = result.programs;
    // const programsMap = new Map(
    //   result.programs.map(item => [item._id.toString(), item.programs])
    // );

    // Check if there are more results
    const hasMore = channels.length > limit;

    return res.status(200).json({
      status: true,
      message: "All liveTV!",
      channels,
      programs,
      pagination: {
        hasMore,
        currentStart: start,
        limit,
      },
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error",
    });
  }
};

exports.adminGet = async (req, res) => {
  try {
    const stream = await Stream.aggregate(
      [
        {
          $sort: {
            createdAt: -1,
          },
        },
        {
          $lookup: {
            from: "programs",
            let: {
              streamId: "$_id",
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $eq: ["$streamId", "$$streamId"],
                  },
                },
              },
              {
                $sort: {
                  start: 1,
                },
              },
            ],
            as: "programs",
          },
        },
        {
          $lookup: {
            from: "languages",
            localField: "language",
            foreignField: "_id",
            as: "language",
            pipeline: [
              {
                $project: {
                  name: 1,
                },
              },
            ],
          },
        },
        {
          $unwind: {
            path: "$language",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "genres",
            localField: "category",
            foreignField: "_id",
            as: "category",
            pipeline: [
              {
                $project: {
                  name: 1,
                },
              },
            ],
          },
        },
        {
          $unwind: {
            path: "$category",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "continentregions",
            localField: "continent",
            foreignField: "_id",
            as: "continent",
            pipeline: [
              {
                $project: {
                  name: 1,
                },
              },
            ],
          },
        },
        {
          $unwind: {
            path: "$continent",
            preserveNullAndEmptyArrays: true,
          },
        },
      ]
    );

    return res.status(200).json({
      status: true,
      message: "All liveTV related data has been get added by Admin!",
      stream,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error",
    });
  }
};

exports.adminGetForSelect = async (req, res) => {
  try {
    const stream = await Stream.aggregate([
      {
        $sort: { createdAt: -1 },
      },
      {
        $project: {
          _id: 1,
          uniqueId: "$_id",
          name: "$channelName",
        },
      },
    ]);

    return res.status(200).json({
      status: true,
      message: "All liveTV related data has been get added by Admin!",
      stream,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error",
    });
  }
};

//update channel
exports.update = async (req, res) => {
  try {
    const stream = await Stream.findById(req.query.streamId);
    if (!stream) {
      return res
        .status(200)
        .json({ status: false, message: "Stream does not found!!" });
    }

    stream.streamURL = req.body.streamURL
      ? req.body.streamURL
      : stream.streamURL;
    stream.channelId = req.body.channelId
      ? req.body.channelId
      : stream.channelId;
    stream.channelName = req.body.channelName
      ? req.body.channelName
      : stream.channelName;
    stream.description = req.body.description
      ? req.body.description
      : stream.description;

    if (req.body.tvChannels) {
      // Validate liveStreams is an array if provided
      if (!Array.isArray(req.body.tvChannels)) {
        return res.status(200).json({
          status: false,
          message: "Tv channels must be an array",
        });
      }
      stream.tvChannels = req.body.tvChannels;
    }

    //Updating and removing category, language, continent, country, city
    if (req.body.category) {
      if (req.body.category === "select_category") stream.category = null;
      else stream.category = req.body.category;
    }
    if (req.body.language) {
      if (req.body.language === "select_language") stream.language = null;
      else stream.language = req.body.language;
    }
    if (req.body.continent) {
      if (req.body.continent === "select_continent") stream.continent = null;
      else stream.continent = req.body.continent;
    }
    if (req.body.country) {
      if (req.body.country === "select_country") stream.country = null;
      else stream.country = req.body.country;
    }
    if (req.body.city) {
      if (req.body.city === "select_city") stream.city = null;
      else stream.city = req.body.city;
    }

    if (req.body.channelLogo) {
      //delete the old channelLogo from digitalOcean Spaces
      const urlParts = stream.channelLogo.split("/");
      const keyName = urlParts.pop(); //remove the last element
      const folderStructure = urlParts.slice(3).join("/"); //Join elements starting from the 4th element

      await deleteFromAzure({ folderStructure, keyName });

      stream.channelLogo = req.body.channelLogo
        ? req.body.channelLogo
        : stream.channelLogo;
    }

    await stream.save();

    return res.status(200).json({
      status: true,
      message: "Channel Updated by admin!",
      stream,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

//delete channel
exports.destroy = async (req, res) => {
  try {
    if (!req.query.streamId) {
      return res
        .status(200)
        .json({ status: false, message: "streamId is required!!" });
    }

    const stream = await Stream.findById(req.query.streamId);
    if (!stream) {
      return res
        .status(200)
        .json({ status: false, message: "Stream does not found!!" });
    }

    if (stream.channelLogo) {
      //delete the old channelLogo from digitalOcean Spaces
      const urlParts = stream.channelLogo.split("/");
      const keyName = urlParts.pop(); //remove the last element
      const folderStructure = urlParts.slice(3).join("/"); //Join elements starting from the 4th element

      await deleteFromAzure({ folderStructure, keyName });
    }

    if (stream.awsStackId) {
      // Get stack resources to find associated S3 buckets
      const stackResources = await CloudFormation
        .listStackResources({
          StackName: stream.awsStackId,
        })
        .promise();

      // Filter out S3 buckets from stack resources
      const s3Buckets = stackResources.StackResourceSummaries.filter(
        (resource) => resource.ResourceType === "AWS::S3::Bucket"
      ).map((resource) => resource.PhysicalResourceId);

      // Empty and delete each bucket
      for (const bucketName of s3Buckets) {
        try {
          // Empty the bucket first
          await emptyS3Bucket(bucketName);

          // Delete the empty bucket
          await S3.deleteBucket({ Bucket: bucketName }).promise();

          console.log(`Successfully deleted bucket: ${bucketName}`);
        } catch (error) {
          console.log(`Error deleting bucket ${bucketName}:`, error);
        }
      }

      // Initiate stack deletion
      await CloudFormation
        .deleteStack({
          StackName: stream.awsStackId, //
        })
        .promise();
    }

    await stream.deleteOne();

    return res
      .status(200)
      .json({ status: true, message: "Channel deleted by admin!!" });
  } catch (error) {
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error",
    });
  }
};

exports.updateStreamKey = async (req, res) => {
  try {
    if (!req.body.streamKey)
      return res
        .status(400)
        .json({ status: false, message: "Stream key required" });

    if (!req.query.streamId) {
      return res.status(400).json({
        status: false,
        message: "Stream ID is required",
      });
    }

    const stream = await Stream.findById(req.query.streamId);
    if (!stream) {
      return res
        .status(200)
        .json({ status: false, message: "Stream does not found!!" });
    }

    const params = {
      InputId: stream.awsInputId,
      Destinations: [
        {
          Url: `${stream.streamPublishUrl}${req.body.streamKey}`,
        },
      ],
    };

    // Call AWS MediaLive to update the input
    const mediaLiveResponse = await MediaLive.updateInput(params).promise();

    stream.streamKey = req.body.streamKey;
    await stream.save();
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

exports.updateChannelStatus = async (req, res) => {
  try {
    const { action, _id } = req.body;

    const stream = await Stream.findById(_id);
    if (!stream) {
      return res.status(200).json({
        status: false,
        message: "Stream not found!",
      });
    }
    if (!stream.awsChannelId) {
      return res.status(200).json({
        status: false,
        message: "AWS Channel ID not found for this stream!",
      });
    }

    if (!["start", "stop"].includes(action)) {
      throw new Error("Invalid action. Use 'start' or 'stop'.");
    }

    const awsChannelId = stream.awsChannelId;

    // Perform the requested action
    const params = { ChannelId: awsChannelId };
    let response;
    if (action === "start") {
      response = await MediaLive.startChannel(params).promise();
      console.log("Channel started successfully:", response);
    } else if (action === "stop") {
      response = await MediaLive.stopChannel(params).promise();
      console.log("Channel stopped successfully:", response);
    }

    stream.awsChannelState = action;
    await stream.save();

    return res
      .status(200)
      .json({ status: true, message: "Channel status updated" });
  } catch (error) {
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

//Signed url
exports.liveStreamSignedUrl = async (req, res) => {
  try {
    // const signedUrl = cloudfrontSigner.getSignedUrl({
    //   url: 'https://d3vk4wyqpxqphy.cloudfront.net/out/v1/37e4b9c434a1459d972359d456018ffc/index.m3u8',
    //   expires: Math.floor((Date.now() + 3600 * 1000) / 1000), // Expires in 1 hour
    // });

    return res.status(200).json({
      status: true,
      message: "Url signed successfully",
      // signedUrl
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error",
    });
  }
};

exports.createProgram = async (req, res) => {
  try {
    // Check if programs array exists in request
    if (
      !req.body.programs ||
      !Array.isArray(req.body.programs) ||
      !req.body.programs.length
    ) {
      return res.status(200).json({
        status: false,
        message: "Programs array is required!",
      });
    }

    const programsToInsert = req.body.programs.map((programData) => {
      // Validate required fields
      if (
        !programData.title ||
        !programData.start ||
        !programData.end ||
        !programData.streamId
      ) {
        throw new Error(
          `Invalid data: Title, start time, end time, and stream ID are required!`
        );
      }

      // Validate dates
      const startDate = new Date(programData.start);
      const endDate = new Date(programData.end);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new Error("Invalid date format!");
      }

      if (endDate <= startDate) {
        throw new Error("End time must be after start time!");
      }

      // Create program object
      const newProgram = {
        streamId: programData.streamId,
        title: programData.title,
        description: programData.description || "",
        start: startDate,
        end: endDate,
        allDay: programData.allDay || false,
        recurring: programData.recurring || false,
      };

      // Add recurrence object only if recurring is true
      if (newProgram.recurring && programData.recurrence) {
        newProgram.recurrence = {
          frequency: programData.recurrence.frequency || "WEEKLY",
          interval: programData.recurrence.interval || 1,
          count: programData.recurrence.count || 1,
        };
      }

      return newProgram;
    });

    // Insert many programs at once
    const result = await ProgramModel.insertMany(programsToInsert, {
      ordered: false,
    });
    console.log("result", result);
    // Fetch the inserted documents
    const insertedPrograms = await ProgramModel.find({
      _id: { $in: result.map((doc) => doc._id) },
    });

    return res.status(200).json({
      status: true,
      message: "Programs created successfully",
      summary: {
        total: result.length,
        created: result.length,
      },
      programs: result,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

// Update a single program
exports.updateProgram = async (req, res) => {
  try {
    const { programId } = req.params;
    const updateData = req.body;

    // Validate if programId exists
    if (!programId) {
      return res.status(400).json({
        status: false,
        message: "Program ID is required!",
      });
    }

    // Validate the update data
    if (updateData.start || updateData.end) {
      const startDate = new Date(updateData.start || "");
      const endDate = new Date(updateData.end || "");

      if (updateData.start && isNaN(startDate.getTime())) {
        return res.status(400).json({
          status: false,
          message: "Invalid start date format!",
        });
      }

      if (updateData.end && isNaN(endDate.getTime())) {
        return res.status(400).json({
          status: false,
          message: "Invalid end date format!",
        });
      }

      if (startDate && endDate && endDate <= startDate) {
        return res.status(400).json({
          status: false,
          message: "End time must be after start time!",
        });
      }
    }

    // Prepare update object
    const updateObj = {
      ...(updateData.title && { title: updateData.title }),
      ...(updateData.description && { description: updateData.description }),
      ...(updateData.start && { start: new Date(updateData.start) }),
      ...(updateData.end && { end: new Date(updateData.end) }),
      ...(typeof updateData.allDay === "boolean" && {
        allDay: updateData.allDay,
      }),
      ...(typeof updateData.recurring === "boolean" && {
        recurring: updateData.recurring,
      }),
    };

    // Handle recurrence update
    if (updateData.recurring && updateData.recurrence) {
      updateObj.recurrence = {
        frequency: updateData.recurrence.frequency || "WEEKLY",
        interval: updateData.recurrence.interval || 1,
        count: updateData.recurrence.count || 1,
      };
    }

    // Update the program
    const updatedProgram = await ProgramModel.findByIdAndUpdate(
      programId,
      { $set: updateObj },
      { new: true } // Return the updated document
    );

    if (!updatedProgram) {
      return res.status(404).json({
        status: false,
        message: "Program not found!",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Program updated successfully",
      program: updatedProgram,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

exports.deleteProgram = async (req, res) => {
  try {
    const { programId } = req.params;

    // Validate if programId exists
    if (!programId || !mongoose.Types.ObjectId.isValid(programId)) {
      return res.status(400).json({
        status: false,
        message: "Invalid Program ID!",
      });
    }

    // Find program before deletion to check if it exists
    const program = await ProgramModel.findById(programId);

    if (!program) {
      return res.status(404).json({
        status: false,
        message: "Program not found!",
      });
    }

    // Delete the program
    await ProgramModel.findByIdAndDelete(programId);

    return res.status(200).json({
      status: true,
      message: "Program deleted successfully",
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

exports.getFavoritesStream = async (req, res) => {
  try {
    const userId = req.user.userId;

    const favorites = await favoriteStreamModel.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
        },
      },
      {
        $lookup: {
          from: "streams",
          localField: "streamId",
          foreignField: "_id",
          as: "stream",
        },
      },
      {
        $unwind: "$stream",
      },
      {
        $replaceRoot: {
          newRoot: {
            $mergeObjects: [
              "$stream",
              {
                favoriteStreamId: "$_id",
                favoriteCreatedAt: "$createdAt",
              },
            ],
          },
        },
      },
      {
        $sort: { createdAt: -1 },
      },
    ]);

    return res.status(200).json({
      status: true,
      message: "Favorite Channel retrieved successfully",
      favorites,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      error: error.message,
    });
  }
};

exports.addStreamToFavorites = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { streamId } = req.params;

    if (!streamId) {
      return res.status(400).json({
        status: false,
        message: "Stream ID is required",
      });
    }

    const favorite = new favoriteStreamModel({
      userId: userId,
      streamId: streamId,
    });

    await favorite.save();

    return res.status(200).json({
      status: true,
      message: "Channel added to favorites successfully",
      favorite,
    });
  } catch (error) {
    // If duplicate entry
    if (error.code === 11000) {
      return res.status(400).json({
        status: false,
        message: "Channel is already in favorites",
      });
    }
    return res.status(500).json({
      status: false,
      error: error.message,
    });
  }
};

exports.removeStreamFromFavorites = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { streamId } = req.params;

    if (!streamId) {
      return res.status(400).json({
        status: false,
        message: "Stream ID is required",
      });
    }

    await favoriteStreamModel.findOneAndDelete({
      userId,
      streamId,
    });

    return res.status(200).json({
      status: true,
      message: "Channel removed from favorites successfully",
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      error: error.message,
    });
  }
};

exports.createPlaylistForStream = async (req, res) => {
  try {
    const { videos, playlistName } = req.body;
    const bucketName = process.env.bucketName;
    const timestamp = Date.now(); // Generate timestamp like 1737984170769

    // Validate input
    if (!videos || !Array.isArray(videos) || videos.length === 0) {
      return res.status(400).json({
        status: false,
        message: "Please provide an array of videos",
      });
    }

    if (!playlistName) {
      return res.status(400).json({
        status: false,
        message: "Please provide a playlist name",
      });
    }

    // Define quality variants
    const qualities = [
      { resolution: "144p", bandwidth: 183000, width: 256, height: 144 },
      { resolution: "360p", bandwidth: 271000, width: 640, height: 360 },
      { resolution: "720p", bandwidth: 612000, width: 1280, height: 720 },
      { resolution: "1080p", bandwidth: 1068000, width: 1920, height: 1080 },
    ];

    // Generate master playlist content
    let masterPlaylistContent = "#EXTM3U\n";
    masterPlaylistContent += "#EXT-X-VERSION:3\n";

    // Add quality variants to master playlist
    for (const quality of qualities) {
      masterPlaylistContent += `#EXT-X-STREAM-INF:BANDWIDTH=${quality.bandwidth},RESOLUTION=${quality.width}x${quality.height}\n`;
      masterPlaylistContent += `${timestamp}_${quality.resolution}.m3u8\n`;
    }

    // Upload master playlist
    const masterPlaylistKey = `playlists/${timestamp}/master.m3u8`;
    await S3
      .putObject({
        Bucket: bucketName,
        Key: masterPlaylistKey,
        Body: masterPlaylistContent,
        ContentType: "application/x-mpegURL",
      })
      .promise();

    // Generate individual quality playlists
    for (const quality of qualities) {
      let qualityPlaylistContent = "#EXTM3U\n";
      qualityPlaylistContent += "#EXT-X-VERSION:3\n";
      qualityPlaylistContent += "#EXT-X-TARGETDURATION:7\n";
      qualityPlaylistContent += "#EXT-X-MEDIA-SEQUENCE:1\n";
      qualityPlaylistContent += "#EXT-X-PLAYLIST-TYPE:VOD\n";

      // Process each video
      for (let i = 0; i < videos.length; i++) {
        const video = videos[i];
        if (!video.path) {
          throw new Error(`Invalid video data: ${JSON.stringify(video)}`);
        }

        // List objects in the video's folder for this quality
        const listParams = {
          Bucket: bucketName,
          Prefix: `transcoded/${video.path}/${video.path}_${quality.resolution}`, // This will match transcoded/1737984170769/1737984170769_144p
          MaxKeys: 1000,
        };

        console.log("list parmas", listParams);

        const objects = await S3.listObjectsV2(listParams).promise();
        console.log("objects", objects);
        const tsFiles = objects.Contents.filter((obj) =>
          obj.Key.endsWith(".ts")
        ).sort((a, b) => {
          // Extract segment number from filename (5 digit number at the end before .ts)
          const segNumA = parseInt(a.Key.match(/(\d{5})\.ts$/)[1]);
          const segNumB = parseInt(b.Key.match(/(\d{5})\.ts$/)[1]);
          return segNumA - segNumB;
        });

        console.log("tsFiles", tsFiles);

        // Add discontinuity marker if not the first video
        if (i > 0) {
          qualityPlaylistContent += "#EXT-X-DISCONTINUITY\n";
        }

        // Add segments to playlist
        for (const tsFile of tsFiles) {
          qualityPlaylistContent += "#EXTINF:6.0,\n";
          qualityPlaylistContent += `https://${bucketName}.s3.amazonaws.com/${tsFile.Key}\n`;
        }
      }

      qualityPlaylistContent += "#EXT-X-ENDLIST\n";

      // Upload quality-specific playlist
      const qualityPlaylistKey = `playlists/${timestamp}/${timestamp}_${quality.resolution}.m3u8`;
      await S3
        .putObject({
          Bucket: bucketName,
          Key: qualityPlaylistKey,
          Body: qualityPlaylistContent,
          ContentType: "application/x-mpegURL",
        })
        .promise();
    }

    // Return success response
    res.json({
      status: true,
      message: "Playlists generated successfully",
      masterPlaylistUrl: `https://${bucketName}.s3.amazonaws.com/${masterPlaylistKey}`,
      playlistContent: masterPlaylistContent,
      videoCount: videos.length,
      timestamp: timestamp,
    });
  } catch (error) {
    console.error("Error generating playlist:", error);
    res.status(500).json({
      status: false,
      message: "Failed to generate playlist",
      error: error.message,
    });
  }
};

exports.getIdList = async (req, res) => {
  try {
    const stream = await Stream.aggregate([
      {
        $project: {
          channelName: 1,
          _id: 1,
        },
      },
      {
        $sort: { createdAt: -1 },
      },
    ]);

    return res.status(200).json({
      status: true,
      message: "Fetched",
      list: stream,
      total: stream.length,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error",
    });
  }
};

// try {
//   const { videos, playlistName } = req.body;
//   const bucketName = process.env.bucketName;
//   const cloudfrontDomain = process.env.cloudfront_distribution;

//   // Validate input
//   if (!videos || !Array.isArray(videos) || videos.length === 0) {
//     return res.status(400).json({
//       status: false,
//       message: "Please provide an array of videos"
//     });
//   }

//   if (!playlistName) {
//     return res.status(400).json({
//       status: false,
//       message: "Please provide a playlist name"
//     });
//   }

//   // Generate master playlist content
//   let masterPlaylistContent = '#EXTM3U\n';
//   masterPlaylistContent += '#EXT-X-VERSION:3\n';
//   masterPlaylistContent += '#EXT-X-PLAYLIST-TYPE:VOD\n';

//   // Add each video to the playlist
//   for (const video of videos) {
//     if (!video.path) {
//       throw new Error(`Invalid video data: ${JSON.stringify(video)}`);
//     }

//     // List objects in the video's folder
//     const listParams = {
//       Bucket: bucketName,
//       Prefix: video.path,
//       MaxKeys: 1000
//     };

//     const objects = await S3.listObjectsV2(listParams).promise();
//     // Find the .m3u8 file
//     const m3u8File = objects.Contents.find(obj => obj.Key.endsWith('.m3u8'));

//     if (!m3u8File) {
//       throw new Error(`No .m3u8 file found in path: ${video.path}`);
//     }

//     // Add video entry to playlist
//     if (video.duration) {
//       masterPlaylistContent += `#EXTINF:${video.duration},\n`;
//     }

//     // Add the full path to the .m3u8 file
//     masterPlaylistContent += `${cloudfrontDomain}/${m3u8File.Key}\n`;
//   }

//   masterPlaylistContent += '#EXT-X-ENDLIST\n';

//   // Upload the playlist to S3
//   const playlistKey = `transcoded/${playlistName}.m3u8`;
//   await S3.putObject({
//     Bucket: bucketName,
//     Key: playlistKey,
//     Body: masterPlaylistContent,
//     ContentType: 'application/x-mpegURL'
//   }).promise();

//   // Return success response
//   res.json({
//     status: true,
//     message: "Playlist generated successfully",
//     playlistUrl: `${cloudfrontDomain}/${playlistKey}`,
//     playlistContent: masterPlaylistContent,
//     videoCount: videos.length
//   });

// } catch (error) {
//   console.error('Error generating playlist:', error);
//   res.status(500).json({
//     status: false,
//     message: "Failed to generate playlist",
//     error: error.message
//   });
// }

// Unable to open input file [https://kalingoott.s3.us-east-1.amazonaws.com/transcoded/test-playlist-2.m3u8]: [Failed probe/open: [No TS file to open from manifest [https://kalingoott.s3.us-east-1.amazonaws.com/transcoded/test-playlist-2.m3u8].]]

// try {
//   const { videos, playlistName } = req.body;
//   const bucketName = process.env.bucketName;
//   const cloudfrontDomain = process.env.cloudfront_distribution.replace('https://', '');

//   // Validate input
//   if (!videos || !Array.isArray(videos) || videos.length === 0) {
//     return res.status(400).json({
//       status: false,
//       message: "Please provide an array of videos"
//     });
//   }

//   if (!playlistName) {
//     return res.status(400).json({
//       status: false,
//       message: "Please provide a playlist name"
//     });
//   }

//   // Generate master playlist content
//   let masterPlaylistContent = '#EXTM3U\n';
//   masterPlaylistContent += '#EXT-X-VERSION:3\n';
//   masterPlaylistContent += '#EXT-X-PLAYLIST-TYPE:VOD\n';
//   masterPlaylistContent += '#EXT-X-TARGETDURATION:10\n'; // Add target duration
//   masterPlaylistContent += '#EXT-X-MEDIA-SEQUENCE:0\n';  // Add media sequence

//   // Add each video to the playlist
//   for (const video of videos) {
//     if (!video.path) {
//       throw new Error(`Invalid video data: ${JSON.stringify(video)}`);
//     }

//     // List objects in the video's folder
//     const listParams = {
//       Bucket: bucketName,
//       Prefix: video.path,
//       MaxKeys: 1000
//     };

//     const objects = await S3.listObjectsV2(listParams).promise();

//     // Find the main m3u8 file
//     const m3u8File = objects.Contents.find(obj => obj.Key.endsWith('.m3u8'));

//     if (!m3u8File) {
//       throw new Error(`No .m3u8 file found in path: ${video.path}`);
//     }

//     // Get the content of the source m3u8 file
//     const m3u8Content = await S3.getObject({
//       Bucket: bucketName,
//       Key: m3u8File.Key
//     }).promise();

//     const m3u8Lines = m3u8Content.Body.toString('utf-8').split('\n');

//     // Process each line of the source m3u8
//     for (const line of m3u8Lines) {
//       if (line.startsWith('#EXTINF:')) {
//         // Copy duration information
//         masterPlaylistContent += `${line}\n`;
//       } else if (line.trim() && !line.startsWith('#')) {
//         // This is a TS file reference
//         // Construct the full path to the TS file
//         const tsPath = `https://${cloudfrontDomain}/${video.path}/${line.trim()}`;
//         masterPlaylistContent += `${tsPath}\n`;
//       } else if (line.startsWith('#EXT-X-')) {
//         // Copy other important EXT tags (except ENDLIST)
//         if (!line.includes('ENDLIST')) {
//           masterPlaylistContent += `${line}\n`;
//         }
//       }
//     }
//   }

//   // Add the final ENDLIST tag
//   masterPlaylistContent += '#EXT-X-ENDLIST\n';

//   // Upload the playlist to S3
//   const playlistKey = `playlists/${playlistName}.m3u8`;
//   await S3.putObject({
//     Bucket: bucketName,
//     Key: playlistKey,
//     Body: masterPlaylistContent,
//     ContentType: 'application/x-mpegURL'
//   }).promise();

//   // Return success response
//   res.json({
//     status: true,
//     message: "Playlist generated successfully",
//     playlistUrl: `https://${cloudfrontDomain}/${playlistKey}`,
//     playlistContent: masterPlaylistContent,
//     videoCount: videos.length
//   });

// } catch (error) {
//   console.error('Error generating playlist:', error);
//   res.status(500).json({
//     status: false,
//     message: "Failed to generate playlist",
//     error: error.message
//   });
// }
