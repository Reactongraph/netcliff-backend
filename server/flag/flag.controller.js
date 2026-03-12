const Flag = require("./flag.model");

//axios
const axios = require("axios");

//get store flag for countryLiveTv
exports.store = async (req, res) => {
  try {
    await axios
      .get("https://restcountries.com/v2/all")
      .then(async (res) => {

        await res.data.map(async (data) => {
          const flag = new Flag();

          flag.countryName = data.name.toLowerCase().trim();
          flag.flag = data.flag;
          await flag.save();
        });
      })
      .catch((error) => {
        {
          console.log(error);
        }
      });
    return res.status(200).json({ status: true, message: "Flag imported Successfully!!" });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error!!",
    });
  }
};

//get flag
exports.index = async (req, res) => {
  try {
    const flag = await Flag.find();

    return res.status(200).json({ status: true, message: "Success!!", flag });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Erro!!",
    });
  }
};
