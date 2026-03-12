exports.populateGenre = [
  {
    $lookup: {
      from: "genres",
      localField: "genre",
      foreignField: "_id",
      as: "genre",
    },
  },
  {
    $project: {
      "genre.createdAt": 0,
      "genre.updatedAt": 0,
    },
  },
];

exports.populateLanguage = [
  {
    $lookup: {
      from: "languages",
      localField: "language",
      foreignField: "_id",
      as: "language",
    },
  },
  {
    $project: {
      "language.createdAt": 0,
      "language.updatedAt": 0,
    },
  },
];

exports.populateRegion = [
  {
    $lookup: {
      from: "regions",
      localField: "region",
      foreignField: "_id",
      as: "region",
    },
  },
  {
    $unwind: {
      path: "$region",
      preserveNullAndEmptyArrays: true,
    },
  },
  {
    $project: {
      "region.createdAt": 0,
      "region.updatedAt": 0,
    },
  },
];

exports.blockCountryWise = (countryUniqueId) => {
  if (!countryUniqueId) {
    return [];
  }
  return [
    {
      $lookup: {
        from: "regions",
        localField: "blockedCountries",
        foreignField: "_id",
        as: "blockedCountriesID",
      },
    },
    {
      $addFields: {
        blockedCountriesID: "$blockedCountriesID.uniqueID",
      },
    },
    {
      $match: {
        blockedCountriesID: {
          $nin: [countryUniqueId],
        },
      },
    },
    {
      $project: {
        blockedCountriesID: 0,
      },
    },
  ];
};

exports.populateSubtitle = [
  {
    $lookup: {
      from: "subtitles",
      localField: "_id",
      foreignField: "movie",
      pipeline: [
        {
          $lookup: {
            from: "languages",
            localField: "language",
            foreignField: "_id",
            as: "languageData",
          },
        },
        {
          $unwind: {
            path: "$languageData",
          },
        },
        {
          $project: {
            languageName: "$languageData.name",
            languageId: "$languageData.uniqueId",
            file: 1,
            language: 1,
          },
        },
      ],
      as: "subtitle",
    },
  },
];

exports.populateTrailers = [
  {
    $lookup: {
      from: "trailers",
      localField: "_id",
      foreignField: "movie",
      as: "trailers",
    },
  },
  {
    $project: {
      "trailers.movie": 0,
      "trailers.convertUpdateType": 0,
      "trailers.createdAt": 0,
      "trailers.updatedAt": 0,
      "trailers.updateType": 0,
    },
  },
];
