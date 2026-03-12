exports.mainAdBannerPipeline = [
  {
    $lookup: {
      from: "movies",
      localField: "contentId",
      foreignField: "_id",
      as: "movie",
    },
  },
  {
    $unwind: {
      path: "$movie",
      preserveNullAndEmptyArrays: true,
    },
  },
  {
    $lookup: {
      from: "streams",
      localField: "contentId",
      foreignField: "_id",
      as: "channel",
    },
  },
  {
    $unwind: {
      path: "$channel",
      preserveNullAndEmptyArrays: true,
    },
  },
  {
    $addFields: {
      contentName: {
        $ifNull: ["$movie.title", "$channel.channelName"],
      },
    },
  },
  {
    $project: {
      movie: 0,
      channel: 0,
    },
  },
];
