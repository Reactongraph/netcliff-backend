const ContinentRegion = require("./continentRegion.model");

//fs
const fs = require("fs");

//axios
const axios = require("axios");

const ContinentByCountry = require("./continentByCountry.json");
const CountryByCityJson = require('./countryByCity.json')
const regionModel = require("../region/region.model");
const CityModel = require("../cities/cities.model");

//create region from TMDB database
exports.getStore = async (req, res) => {
  try {
    await axios
      .get(
        "https://api.themoviedb.org/3/configuration/countries?api_key=67af5e631dcbb4d0981b06996fcd47bc"
      )
      .then(async (res) => {
        await res.data.map(async (data) => {
          const region = new ContinentRegion();
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
    if (!req.body.name || req.body.order === undefined) {
      return res
        .status(200)
        .json({ status: false, message: "Oops! Name and order are required!" });
    }

    const existingRegion = await ContinentRegion.findOne({
      $or: [
        { name: req.body.name.toUpperCase().trim() },
        { order: req.body.order }
      ]
    });

    if (existingRegion) {
      if (existingRegion.name === req.body.name.toUpperCase().trim()) {
        return res
          .status(200)
          .json({ status: false, message: "This region name already exists." });
      }
      if (existingRegion.order === req.body.order) {
        return res
          .status(200)
          .json({ status: false, message: "This region order already exists." });
      }
    }

    const region = new ContinentRegion();
    region.name = req.body.name.toUpperCase().trim();
    if (req.body.order)
      region.order = req.body.order;
    await region.save();

    return res.status(200).json({
      status: true,
      message: "Success",
      region,
    });
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
    const { name, order } = req.body
    if (!req.query.regionId) {
      return res
        .status(200)
        .json({ status: false, message: "RegionId is required!!" });
    }

    const region = await ContinentRegion.findById(req.query.regionId);
    if (!region) {
      return res
        .status(200)
        .json({ status: false, message: "Region does not found." });
    }

    const existingRegion = await ContinentRegion.findOne({
      $or: [
        { name: name ? name.toUpperCase().trim() : null },
        { order: order },
      ],
      _id: { $ne: req.query.regionId } // Exclude current region
    });

    console.log('existingRegion', existingRegion)
    if (existingRegion) {
      if (existingRegion.name === name?.toUpperCase().trim()) {
        return res
          .status(200)
          .json({ status: false, message: "Region name already exists." });
      }
      if (existingRegion.order === order) {
        return res
          .status(200)
          .json({ status: false, message: "Region order already exists." });
      }
    }

    if (name) {
      region.name = name.toUpperCase().trim();
    }
    if (order !== undefined) {
      region.order = order;
    }

    await region.save();

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

    const region = await ContinentRegion.findById(req.query.regionId);

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
    const { sortBy = 'name', sortOrder = 1 } = req.query;
    const sortObj = {};
    sortObj[sortBy] = parseInt(sortOrder);

    const region = await ContinentRegion.find().sort(sortObj);

    return res.status(200).json({ status: true, message: "Success", region });
  } catch (error) {
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error!!",
    });
  }
};


exports.updateAddCountry = async (req, res) => {
  try {
    // Fetch all continent regions and countries
    const continentRegions = await ContinentRegion.find({});
    const countries = await regionModel.find({});

    // Create maps for easy lookup
    const continentMap = new Map(
      continentRegions.map(region => [region.name, region._id])
    );

    const countryMap = new Map(
      countries.map(country => [country.uniqueID, {
        ...country._doc,
        hasContinent: !!country.continent
      }])
    );

    // Validate and prepare updates only for countries without continents
    const validationResults = Object.entries(ContinentByCountry)
      .map(([countryCode, countryData]) => {
        const continentName = countryData.continent_name.toUpperCase();
        const continentId = continentMap.get(continentName);
        const existingCountry = countryMap.get(countryCode);

        return {
          countryCode,
          countryName: countryData.country_name,
          existingCountryId: existingCountry ? existingCountry._id : null,
          existingCountryName: existingCountry ? existingCountry.name : null,
          isCountryExisting: !!existingCountry,
          continentName,
          continentId: continentId || null,
          isContinentValid: !!continentId,
          // Only need update if country exists, continent is valid, and country doesn't have a continent
          needsUpdate: !!existingCountry && !!continentId && !existingCountry.hasContinent
        };
      });

    // Perform updates only for countries that need continent assignment
    const updatePromises = validationResults
      .filter(result => result.needsUpdate)
      .map(async (result) => {
        try {
          return await regionModel.findByIdAndUpdate(
            result.existingCountryId,
            {
              continent: result.continentId,
            },
            { new: true }
          );
        } catch (error) {
          console.error(`Error updating country ${result.countryCode}:`, error);
          return null;
        }
      });

    // Wait for all updates to complete
    const updateResults = await Promise.all(updatePromises);

    // Create summary
    const summary = {
      total: {
        countries: validationResults.length,
        existingCountries: validationResults.filter(r => r.isCountryExisting).length,
        countriesWithoutContinent: validationResults.filter(r => r.isCountryExisting && !countryMap.get(r.countryCode).hasContinent).length,
        validContinents: validationResults.filter(r => r.isContinentValid).length,
        updatedCountries: updateResults.filter(Boolean).length
      },
      mismatches: {
        countries: validationResults.filter(r => !r.isCountryExisting),
        continents: validationResults.filter(r => !r.isContinentValid)
      },
      updateResults: {
        successful: updateResults.filter(Boolean),
        failed: validationResults.filter(r => r.needsUpdate).length - updateResults.filter(Boolean).length,
        skipped: validationResults.filter(r => r.isCountryExisting && countryMap.get(r.countryCode).hasContinent).length
      }
    };

    // Log results
    console.log('Update Summary:', {
      totalProcessed: validationResults.length,
      updatesAttempted: updateResults.length,
      successfulUpdates: updateResults.filter(Boolean).length,
      failedUpdates: updateResults.length - updateResults.filter(Boolean).length,
      skippedUpdates: summary.updateResults.skipped
    });

    return res.status(200).json({
      status: true,
      message: "Countries updated successfully",
      summary,
      details: validationResults
    });

  } catch (error) {
    console.error('Error in updating countries:', error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error!!"
    });
  }
};

exports.updateAddCities = async (req, res) => {
  try {
    // 1. First get all existing countries
    const existingCountries = await regionModel.find({});

    // Create lookup map for countries
    const countryMap = new Map(
      existingCountries.map(country => [country.name.toUpperCase(), country])
    );

    // Process each country from the JSON
    const results = await Promise.all(CountryByCityJson.map(async (item) => {
      const countryName = item.country.toUpperCase();
      const country = countryMap.get(countryName);

      // Skip if country not found
      if (!country) {
        return {
          country: item.country,
          status: 'country_not_found',
          citiesCount: Array.isArray(item.cities) ? item.cities.length : 0
        };
      }

      // Get existing cities for this country/region
      const existingCities = await CityModel.find({ region: country._id });
      const existingCityNames = new Set(existingCities.map(city =>
        city.name.toLowerCase()
      ));

      // Filter out cities that already exist
      const newCities = item.cities.filter(cityName =>
        !existingCityNames.has(cityName.toLowerCase())
      );

      // Prepare cities data for this country (only new cities)
      const citiesToAdd = newCities.map(cityName => ({
        name: cityName,
        region: country._id
      }));

      // Bulk insert new cities only if there are any
      const createdCities = citiesToAdd.length > 0
        ? await CityModel.insertMany(citiesToAdd)
        : [];

      return {
        country: item.country,
        totalCities: item.cities.length,
        existingCities: existingCities.length,
        newCitiesAdded: createdCities.length,
        details: {
          cities: createdCities.map(city => city.name)
        }
      };
    }));

    // Create summary
    const summary = {
      totalCountries: results.length,
      countriesProcessed: results.filter(r => r.status !== 'country_not_found').length,
      countriesNotFound: results.filter(r => r.status === 'country_not_found').length,
      totalCitiesAdded: results.reduce((sum, r) => sum + (r.newCitiesAdded || 0), 0),
      totalExistingCities: results.reduce((sum, r) => sum + (r.existingCities || 0), 0)
    };

    console.log('Import Summary:', summary);

    return res.status(200).json({
      status: true,
      message: "Cities import completed",
      summary,
      results
    });

  } catch (error) {
    console.error('Error in importing cities:', error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error!!"
    });
  }
}