const axios = require("axios");
const xml2js = require("xml2js");

async function parseXmlResponse(xmlData) {
  return new Promise((resolve, reject) => {
    const parser = new xml2js.Parser({
      explicitArray: false,
      trim: true,
    });
    parser.parseString(xmlData, (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
}

async function fetchBusLocationData(url) {
  try {
    const response = await axios.get(url, {
      timeout: 10000,
    });

    const parsedData = await parseXmlResponse(response.data);

    if (
      !parsedData ||
      !parsedData.ServiceResult ||
      !parsedData.ServiceResult.msgHeader
    ) {
      throw new Error("API 응답 구조 오류");
    }

    if (parsedData.ServiceResult.msgHeader.resultCode !== "0") {
      throw new Error(
        `API 오류: ${parsedData.ServiceResult.msgHeader.resultMsg}`
      );
    }

    if (
      !parsedData.ServiceResult.msgBody ||
      !parsedData.ServiceResult.msgBody.itemList
    ) {
      return [];
    }

    let busItems = parsedData.ServiceResult.msgBody.itemList;
    if (!Array.isArray(busItems)) {
      busItems = [busItems];
    }

    return busItems;
  } catch (error) {
    throw error;
  }
}

function isBusAtEndStation(currentStopName, direction, endStations) {
  return currentStopName === endStations[direction];
}

function getCurrentFormattedDateTime() {
  const currentTime = new Date();
  const formattedDate = `${currentTime.getFullYear()}.${String(
    currentTime.getMonth() + 1
  ).padStart(2, "0")}.${String(currentTime.getDate()).padStart(2, "0")}`;
  const formattedTime = `${String(currentTime.getHours()).padStart(
    2,
    "0"
  )}:${String(currentTime.getMinutes()).padStart(2, "0")}`;

  return {
    date: formattedDate,
    time: formattedTime,
    dateTime: `${formattedDate} ${formattedTime}`,
  };
}

module.exports = {
  parseXmlResponse,
  fetchBusLocationData,
  isBusAtEndStation,
  getCurrentFormattedDateTime,
};
