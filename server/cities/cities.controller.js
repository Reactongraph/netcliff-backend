const { default: mongoose } = require("mongoose");
const CityModel = require("./cities.model");


//get city
exports.get = async (req, res) => {
  try {
    const { regionId, start: reqStart, limit: reqLimit, search, includeRegionDetails = 'true' } = req.query;
    const start = reqStart ? parseInt(reqStart) : 1;
    const limit = reqLimit ? parseInt(reqLimit) : 10;

    let matchQuery = {};
    if (regionId) {
      matchQuery.region = new mongoose.Types.ObjectId(regionId);;
    }

    if (search) {
      matchQuery.$text = {
        $search: search,
        $caseSensitive: false,
        $diacriticSensitive: false
      };
    }

    let pipeline = [
      {
        $match: matchQuery
      },
      {
        $sort: { name: 1 }
      },
      {
        $skip: (start - 1) * limit
      },
      {
        $limit: limit
      }]

    if (includeRegionDetails === 'true')
      pipeline.push(
        {
          $lookup: {
            from: 'regions',
            localField: 'region',
            foreignField: '_id',
            as: 'region',
            pipeline: [
              {
                $project: {
                  _id: 1,
                  name: 1,
                  uniqueID: 1
                }
              }
            ]
          }
        },
        {
          $unwind: {
            path: '$region',
            preserveNullAndEmptyArrays: true
          }
        })

    const [totalCities, cities] = await Promise.all([
      CityModel.countDocuments(matchQuery),
      CityModel.aggregate(pipeline)
    ])

    return res.status(200).json({
      status: true,
      message: "Success",
      cities,
      totalCities,
      currentPage: start,
      limit
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error!!",
    });
  }
};


exports.store = async (req, res) => {
  try {
    const { name, region } = req.body
    if (!name && !region) {
      return res
        .status(200)
        .json({ status: false, message: "Oops ! Invalid details!" });
    }

    let city = await CityModel.find({
      name: name.toUpperCase().trim(),
      region: region
    });


    if (city.length === 0) {
      let city = new CityModel();
      city.name = name.toUpperCase().trim();
      city.region = region
      await city.save();

      city = await CityModel.findById(city._id).populate("region");

      return res.status(200).json({
        status: true,
        message: "Success",
        city,
      });
    } else {
      return res
        .status(200)
        .json({ status: false, message: "This city already exists." });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error",
    });
  }
};

exports.update = async (req, res) => {
  try {
    const { name, region } = req.body
    if (!req.query.cityId) {
      return res
        .status(200)
        .json({ status: false, message: "CityId is required!!" });
    }

    if (!name && !region) {
      return res
        .status(200)
        .json({ status: false, message: "Oops ! Invalid details!" });
    }

    let city = await CityModel.findById(req.query.cityId);
    if (!city) {
      return res
        .status(200)
        .json({ status: false, message: "City does not found." });
    }

    // Check if new name already exists for another city in the same region
    const existingCity = await CityModel.findOne({
      _id: { $ne: req.query.cityId },
      name: name.toUpperCase().trim(),
      region: region
    });

    if (existingCity) {
      return res.status(200).json({
        status: false,
        message: "City with this name already exists in the selected region."
      });
    }

    // Update data object
    const updateData = {
      name: req.body.name.toUpperCase().trim()
    };

    // Add region to update if provided
    if (req.body.region) {
      updateData.region = req.body.region;
    }

    // Update city
    await CityModel.findByIdAndUpdate(
      req.query.cityId,
      updateData,
      { new: true }
    );

    city = await CityModel.findById(city._id).populate("region");

    return res.status(200).json({
      status: true,
      message: "Success",
      city,
    });

  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error!!",
    });
  }
};

exports.destroy = async (req, res) => {
  try {
    if (!req.query.regionId) {
      return res
        .status(200)
        .json({ status: false, message: "City Id is required!!" });
    }

    const city = await CityModel.findById(req.query.regionId);

    if (!city) {
      return res
        .status(200)
        .json({ status: false, message: "City does not found!!" });
    }

    await city.deleteOne();

    return res
      .status(200)
      .json({ status: true, message: "Delete Successful ✔" });
  } catch (error) {
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error!!",
    });
  }
};
