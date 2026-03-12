const CountryLiveTV = require("./countryLiveTV.model");

//axios
const axios = require("axios");

//create countryLiveTV from IPTV for admin
exports.getStore = async (req, res) => {
  try {
    await axios
      .get("https://iptv-org.github.io/api/countries.json")
      .then(async (res) => {
        await res.data.map(async (data) => {
          //console.log("response -----", res.data);
          //console.log("response length-----", res.data.length);

          const countryLiveTV = new CountryLiveTV();

          countryLiveTV.countryName = data.name.toLowerCase().trim();
          countryLiveTV.countryCode = data.code;
          countryLiveTV.flag = data.flag;
          await countryLiveTV.save();

          //console.log("countryLiveTV---", countryLiveTV);
        });
      })
      .catch((error) => console.log(error));
    return res
      .status(200)
      .json({ status: true, message: "CountryLiveTV Imported Successfully." });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error",
    });
  }
};

//get countryLiveTV from IPTV for admin
exports.get = async (req, res) => {
  try {
    const countryLiveTV = await CountryLiveTV.find().sort({ createdAt: -1 });

    return res
      .status(200)
      .json({ status: true, message: "Success", countryLiveTV });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

//if isIptvAPI false then get country wise channel and stream ,if isIptvAPI true then get country wise channel and stream added by admin
exports.getStoredetail = async (req, res) => {
  try {
    if (!req.query.countryName)
      return res
        .status(200)
        .json({ status: false, message: "countryName must be required." });

    const country = await CountryLiveTV.findOne({
      countryName: req.query.countryName.toLowerCase().trim(),
    });
    if (!country) {
      return res
        .status(200)
        .json({ status: false, message: "country does not found for liveTv." });
    }

    //for handle IPTVdata
    const IPTVdata = settingJSON.isIptvAPI;

    if (country) {
      //channel json imported
      const configChannel = {
        method: "GET",
        url: "https://iptv-org.github.io/api/channels.json",
        headers: {
          "Content-Type": "application/json",
        },
      };

      const channelJson = await axios(configChannel);

      //stream json imported
      const configStream = {
        method: "GET",
        url: "https://iptv-org.github.io/api/streams.json",
        headers: {
          "Content-Type": "application/json",
        },
      };

      const streamJson = await axios(configStream);

      const channelData = [];
      await channelJson?.data?.map(async (data) => {
        if (data.country === country.countryCode) {
          const channel = {};

          channel.channelId = data.id;
          channel.channelName = data.name;
          channel.country = data.country;
          channel.image = data.logo;

          channelData.push(channel);
        }
      });

      const streamData = [];
      await streamJson?.data?.map(async (dataStream) => {
        //map in channelData for match channelId
        const streamRecord = channelData.find(
          (c) => c.channelId === dataStream.channel
        );

        if (streamRecord) {
          const stream = {};

          stream.channelId = dataStream.channel;
          stream.streamURL = dataStream.url;
          stream.channelName = streamRecord.channelName;
          stream.channelLogo = streamRecord.image;
          stream.countryCode = streamRecord.country;

          streamData.push(stream);
        }
      });

      return res.status(200).json({
        status: true,
        message: "Success",
        //streamData,
        streamData: IPTVdata === false ? streamData : [],
      });
    }
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json({ status: false, error: error.message || "Internal Server error" });
  }
};

//get country wise channel and stream for admin
exports.getStoredetails = async (req, res) => {
  try {
    if (!req.query.countryName) {
      return res
        .status(200)
        .json({ status: false, message: "countryName must be required." });
    }

    const country = await CountryLiveTV.findOne({
      countryName: req.query.countryName.toLowerCase().trim(),
    });
    if (!country) {
      return res
        .status(200)
        .json({ status: false, message: "country does not found for liveTv." });
    }

    if (country) {
      //channel json imported
      const configChannel = {
        method: "GET",
        url: "https://iptv-org.github.io/api/channels.json",
        headers: {
          "Content-Type": "application/json",
        },
      };

      const channelJson = await axios(configChannel);

      //stream json imported
      const configStream = {
        method: "GET",
        url: "https://iptv-org.github.io/api/streams.json",
        headers: {
          "Content-Type": "application/json",
        },
      };

      const streamJson = await axios(configStream);

      const channelData = [];
      await channelJson?.data?.map(async (data) => {
        if (data.country === country.countryCode) {
          const channel = {};

          channel.channelId = data.id;
          channel.channelName = data.name;
          channel.country = data.country;
          channel.image = data.logo;

          channelData.push(channel);
        }
      });

      const streamData = [];
      await streamJson?.data?.map(async (dataStream) => {
        //map in channelData for match channelId
        const streamRecord = channelData.find(
          (c) => c.channelId === dataStream.channel
        );

        if (streamRecord) {
          const stream = {};

          stream.channelId = dataStream.channel;
          stream.streamURL = dataStream.url;
          stream.channelName = streamRecord.channelName;
          stream.channelLogo = streamRecord.image;
          stream.countryCode = streamRecord.country;

          streamData.push(stream);
        }
      });

      return res.status(200).json({
        status: true,
        message: "Success",
        streamData,
      });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error",
    });
  }
};
