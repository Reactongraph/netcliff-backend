const Advertisement = require("./advertisement.model");

//create advertisement
exports.store = async (req, res) => {
  try {
    const advertisement = new Advertisement();

    await advertisement.save();

    return res
      .status(200)
      .json({ status: true, message: "Success!!", advertisement });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error!!",
    });
  }
};

//update advertisement
exports.update = async (req, res) => {
  try {
    const advertisement = await Advertisement.findById(req.query.addId);

    if (!advertisement)
      return res.status(200).json({
        status: false,
        message: "Add does not found!!",
      });

    advertisement.native = req.body.native
      ? req.body.native
      : advertisement.native;
    advertisement.interstitial = req.body.interstitial
      ? req.body.interstitial
      : advertisement.interstitial;

    advertisement.reward = req.body.reward
      ? req.body.reward
      : advertisement.reward;
    advertisement.banner = req.body.banner
      ? req.body.banner
      : advertisement.banner;

    advertisement.nativeIos = req.body.nativeIos
      ? req.body.nativeIos
      : advertisement.nativeIos;
    advertisement.interstitialIos = req.body.interstitialIos
      ? req.body.interstitialIos
      : advertisement.interstitialIos;

    advertisement.rewardIos = req.body.rewardIos
      ? req.body.rewardIos
      : advertisement.rewardIos;
    advertisement.bannerIos = req.body.bannerIos
      ? req.body.bannerIos
      : advertisement.bannerIos;

    await advertisement.save();

    return res.status(200).json({
      status: true,
      message: "Success!!",
      advertisement,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error!!",
    });
  }
};

//get advertisement
exports.getAdd = async (req, res) => {
  try {
    const advertisement = await Advertisement.findOne({});

    return res.status(200).json({
      status: true,
      message: "Advertisement get Successfully!!",
      advertisement,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error!!",
    });
  }
};

//googleAdd handle on or off
exports.googleAdd = async (req, res) => {
  try {
    const advertisement = await Advertisement.findById(req.query.addId);

    if (!advertisement)
      return res.status(200).json({
        status: false,
        message: "Add does not found!!",
      });

    advertisement.isGoogleAdd = !advertisement.isGoogleAdd;

    await advertisement.save();

    return res
      .status(200)
      .json({ status: true, message: "Success!!", advertisement });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error!!",
    });
  }
};

//appAdOnOff handle
//exports.appAddOnOff = async (req, res) => {
//   try {
//     const advertisement = await Advertisement.findById(req.query.addId);

//     if (!advertisement)
//       return res.status(200).json({
//         status: false,
//         message: "Add does not found!!",
//       });

//     advertisement.isAppAddOnOff = !advertisement.isAppAddOnOff;

//     if (advertisement.isAppAddOnOff === true) {
//       advertisement.isAppAddOn = false;
//     } else {
//       advertisement.isAppAddOn = true;
//     }

//     await advertisement.save();

//     return res
//       .status(200)
//       .json({ status: true, message: "Success!!", advertisement });
//   } catch (error) {
//     console.log(error);
//     return res.status(500).json({
//       status: false,
//       message: error.message || "Internal Server Error!!",
//     });
//   }
//};

//appAddOn handle
//exports.appAddOn = async (req, res) => {
//   try {
//     const advertisement = await Advertisement.findById(req.params.adId);

//     if (!advertisement)
//       return res.status(200).json({
//         status: false,
//         message: "Add does not found!!",
//       });

//     if (advertisement.isAppAddOnOff === true) {
//       advertisement.isAppAddOn = false;
//     } else {
//       advertisement.isAppAddOn = !advertisement.isAppAddOn;
//     }

//     await advertisement.save();

//     return res
//       .status(200)
//       .json({ status: true, message: "Success!!", advertisement });
//   } catch (error) {
//     console.log(error);
//     return res.status(500).json({
//       status: false,
//       message: error.message || "Internal Server Error!!",
//     });
//   }
//};
