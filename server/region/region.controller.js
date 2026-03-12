const Region = require("./region.model");

//fs
const fs = require("fs");

//axios
const axios = require("axios");

//create region from TMDB database
exports.getStore = async (req, res) => {
  try {
    await axios
      .get(
        "https://api.themoviedb.org/3/configuration/countries?api_key=67af5e631dcbb4d0981b06996fcd47bc"
      )
      .then(async (res) => {
        await res.data.map(async (data) => {
          const region = new Region();
          region.name = data.english_name.toUpperCase().trim();
          region.uniqueID = data.iso_3166_1;
          await region.save();
        });
      })
      .catch((error) => console.log(error));
    return res
      .status(200)
      .json({ status: true, message: "Region Imported Successfully!!" });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error",
    });
  }
};

//create region
exports.store = async (req, res) => {
  try {
    const { continent } = req.body
    if (!req.body.name || !continent) {
      return res
        .status(200)
        .json({ status: false, message: "Oops ! Invalid details!" });
    }

    const region = await Region.find({
      name: req.body.name.toUpperCase().trim(),
      continent: continent
    });

    if (region.length === 0) {
      let region = new Region();
      region.name = req.body.name.toUpperCase().trim();
      region.continent = continent;
      await region.save();

      region = await Region.findById(region._id).populate("continent");

      return res.status(200).json({
        status: true,
        message: "Success",
        region,
      });
    } else {
      return res
        .status(200)
        .json({ status: false, message: "This region already exists." });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error",
    });
  }
};

//update region
exports.update = async (req, res) => {
  try {
    const { name, continent } = req.body
    if (!req.query.regionId) {
      return res
        .status(200)
        .json({ status: false, message: "regionId is required!!" });
    }

    if (!name && !continent) {
      return res
        .status(200)
        .json({ status: false, message: "Oops ! Invalid details!" });
    }

    let region = await Region.findById(req.query.regionId);
    if (!region) {
      return res
        .status(200)
        .json({ status: false, message: "Region does not found." });
    }

    const existingRegion = await Region.findOne({
      _id: { $ne: req.query.regionId },
      name: name.toUpperCase().trim(),
      continent: continent
    });

    if (existingRegion) {
      return res.status(200).json({
        status: false,
        message: "Region with this name already exists in the selected continent."
      });
    }

    const updateData = {
      name: req.body.name.toUpperCase().trim()
    };

    // Add continent to update if provided
    if (req.body.continent) {
      updateData.continent = req.body.continent;
    }

    // Update region
    await Region.findByIdAndUpdate(
      req.query.regionId,
      updateData,
      { new: true }
    );

    region = await Region.findById(region._id)
      .populate({
        path: "continent",
        strictPopulate: false
      });

    return res.status(200).json({
      status: true,
      message: "Success",
      region,
    });

  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error!!",
    });
  }
};

//delete region
exports.destroy = async (req, res) => {
  try {
    if (!req.query.regionId) {
      return res
        .status(200)
        .json({ status: false, message: "Region Id is required!!" });
    }

    const region = await Region.findById(req.query.regionId);

    if (!region) {
      return res
        .status(200)
        .json({ status: false, message: "Region does not found!!" });
    }

    if (req.file) {
      const deleteImage = region.image.split("storage");

      if (deleteImage) {
        if (fs.existsSync("storage" + deleteImage[0])) {
          fs.unlinkSync("storage" + deleteImage[0]);
        }
      }
    }

    await region.deleteOne();

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

//get region
exports.get = async (req, res) => {
  try {
    const { includeContinentDetails = 'true' } = req?.query

    // const region = await Region.find().sort({ createdAt: -1 });
    let pipeline = [];

    if (includeContinentDetails === 'true')
      pipeline.push(
        {
          $lookup: {
            from: "continentregions",
            localField: "continent",
            foreignField: "_id",
            as: "continent",
            pipeline: [
              {
                $project: {
                  _id: 1,
                  name: 1,
                  uniqueID: 1
                }
              }
            ]
          },
        },
        {
          $unwind: {
            path: '$continent',
            preserveNullAndEmptyArrays: true
          }
        })


    pipeline.push({
      $lookup: {
        from: "countrylivetvs",
        localField: "uniqueID",
        foreignField: "countryCode",
        as: "otherData",
      },
    },
      {
        $unwind: {
          path: "$otherData",
          preserveNullAndEmptyArrays: false,
        },
      },
      {
        $project: {
          _id: 1,
          uniqueID: 1,
          name: 1,
          continent: 1,
          createdAt: 1,
          updatedAt: 1,
          flag: "$otherData.flag",
        },
      },
      {
        $sort: {
          name: 1,
        },
      })


    const region = await Region.aggregate(pipeline);

    return res.status(200).json({ status: true, message: "Success", region });
  } catch (error) {
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error!!",
    });
  }
};
