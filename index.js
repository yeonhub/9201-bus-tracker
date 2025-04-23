require("dotenv").config();

const url = "http://apis.data.go.kr/6280000/busLocationService";

const serviceKey = process.env.SERVICE_KEY;
const numOfRows = 100;
const pageNo = 1;
const routeId = process.env.ROUTE_ID;

const busLocationUrl = `${url}/getBusRouteLocation?serviceKey=${serviceKey}&numOfRows=${numOfRows}&pageNo=${pageNo}&routeId=${routeId}`;

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const xml2js = require("xml2js");

const rootJsonPath = path.join(__dirname, "9201root.json");
const dataJsonPath = path.join(__dirname, "9201.json");

const busRouteStops = JSON.parse(fs.readFileSync(rootJsonPath, "utf8"));

const startStations = {
  1: busRouteStops[0],
  2: busRouteStops[26],
};

console.log("시작 정류장 설정:", startStations);

let busData = {};
try {
  if (fs.existsSync(dataJsonPath)) {
    const fileContent = fs.readFileSync(dataJsonPath, "utf8");
    if (fileContent) {
      busData = JSON.parse(fileContent);
    }
  }
} catch (error) {
  console.error("기존 데이터 로드 중 오류 발생:", error);
}

const activeBusJourneys = {};

const busJourneyCounts = {};

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

function isBusAtEndStation(currentStopName, direction) {
  const endStations = {
    1: "시대아파트",
    2: "성호아파트",
  };

  return currentStopName === endStations[direction];
}

async function fetchBusLocationData() {
  try {
    console.log(`API 호출 중: ${busLocationUrl}`);

    const response = await axios.get(busLocationUrl, {
      timeout: 10000,
    });
    const xmlData = response.data;
    console.log("API 응답 수신 성공");

    console.log("응답 데이터 일부:", xmlData.substring(0, 200) + "...");

    const parsedData = await parseXmlResponse(xmlData);

    if (
      !parsedData ||
      !parsedData.ServiceResult ||
      !parsedData.ServiceResult.msgHeader
    ) {
      console.error(
        "API 응답 구조가 예상과 다릅니다:",
        JSON.stringify(parsedData).substring(0, 500)
      );
      throw new Error("API 응답 구조 오류");
    }

    if (parsedData.ServiceResult.msgHeader.resultCode !== "0") {
      throw new Error(
        `API 오류: ${parsedData.ServiceResult.msgHeader.resultMsg}`
      );
    }

    const currentTime = new Date();
    const formattedDate = `${currentTime.getFullYear()}.${String(
      currentTime.getMonth() + 1
    ).padStart(2, "0")}.${String(currentTime.getDate()).padStart(2, "0")}`;
    const formattedTime = `${String(currentTime.getHours()).padStart(
      2,
      "0"
    )}:${String(currentTime.getMinutes()).padStart(2, "0")}`;

    if (
      !parsedData.ServiceResult.msgBody ||
      !parsedData.ServiceResult.msgBody.itemList
    ) {
      console.log("버스 항목이 없습니다.");
      return;
    }

    let busItems = parsedData.ServiceResult.msgBody.itemList;
    if (!Array.isArray(busItems)) {
      busItems = [busItems];
    }

    console.log(`처리할 버스 대수: ${busItems.length}`);

    busItems.forEach((bus) => {
      const busNumber = bus.BUS_NUM_PLATE;
      const currentStopName = bus.LATEST_STOP_NAME;
      const remainingSeats = bus.REMAIND_SEAT;
      const direction = bus.DIRCD;

      console.log(
        `버스 ${busNumber} 처리 중: 현재 위치=${currentStopName}, 방향=${direction}`
      );

      let busJourneyId;

      const dateKey = `${busNumber}-${formattedDate}`;
      if (!busJourneyCounts[dateKey]) {
        busJourneyCounts[dateKey] = 0;
      }

      if (currentStopName === startStations[direction]) {
        busJourneyCounts[dateKey]++;

        busJourneyId = `${busNumber}-${formattedDate}-${busJourneyCounts[dateKey]}`;
        console.log(`새 여정 시작: ${busJourneyId} (${currentStopName}에서)`);

        activeBusJourneys[busNumber] = busJourneyId;
      } else if (isBusAtEndStation(currentStopName, direction)) {
        busJourneyId = activeBusJourneys[busNumber];

        if (busJourneyId) {
          if (
            busData[busJourneyId] &&
            !busData[busJourneyId].stops[currentStopName]
          ) {
            busData[busJourneyId].stops[
              currentStopName
            ] = `${formattedDate} / ${formattedTime} / ${remainingSeats}석`;
            busData[busJourneyId].journeyEndTime = formattedTime;
            busData[busJourneyId].journeyEndDate = formattedDate;
            console.log(
              `버스 ${busNumber}의 여정 종료: ${busJourneyId} (${currentStopName}에서)`
            );
          }

          delete activeBusJourneys[busNumber];
        }

        return;
      } else {
        busJourneyId = activeBusJourneys[busNumber];

        if (!busJourneyId) {
          busJourneyCounts[dateKey]++;

          busJourneyId = `${busNumber}-${formattedDate}-${busJourneyCounts[dateKey]}-partial`;
          console.log(`중간에 추적 시작: ${busJourneyId}`);
          activeBusJourneys[busNumber] = busJourneyId;
        }
      }

      if (!busData[busJourneyId]) {
        busData[busJourneyId] = {
          busNumber: busNumber,
          journeyStartTime: formattedTime,
          journeyStartDate: formattedDate,
          direction: direction,
          stops: {},
        };
      }

      if (!busData[busJourneyId].stops[currentStopName]) {
        busData[busJourneyId].stops[
          currentStopName
        ] = `${formattedDate} / ${formattedTime} / ${remainingSeats}석`;
        console.log(`정류장 정보 추가: ${currentStopName} (${busJourneyId})`);
      }

      busData[busJourneyId].lastUpdated = `${formattedDate} ${formattedTime}`;
    });

    fs.writeFileSync(dataJsonPath, JSON.stringify(busData, null, 2), "utf8");
    console.log(
      `${currentTime.toLocaleString()} - 버스 위치 정보 업데이트 완료 (${
        busItems.length
      }대)`
    );
  } catch (error) {
    console.error("버스 위치 정보 가져오기 실패:", error);
    console.log("다음 실행에서 다시 시도합니다.");
  }
}

function cleanupOldJourneys() {
  const currentTime = new Date();
  const thresholdTime = new Date(currentTime.getTime() - 30 * 60000);

  Object.keys(activeBusJourneys).forEach((busNumber) => {
    const journeyId = activeBusJourneys[busNumber];

    if (busData[journeyId] && busData[journeyId].lastUpdated) {
      const lastUpdatedParts = busData[journeyId].lastUpdated.split(" ");
      const lastUpdatedDate = lastUpdatedParts[0].split(".");
      const lastUpdatedTime = lastUpdatedParts[1].split(":");

      const lastUpdateTime = new Date(
        parseInt(lastUpdatedDate[0]),
        parseInt(lastUpdatedDate[1]) - 1,
        parseInt(lastUpdatedDate[2]),
        parseInt(lastUpdatedTime[0]),
        parseInt(lastUpdatedTime[1])
      );

      if (lastUpdateTime < thresholdTime) {
        console.log(
          `버스 ${busNumber}의 여정 ${journeyId} 추적 종료 (30분 이상 업데이트 없음)`
        );
        delete activeBusJourneys[busNumber];
      }
    }
  });
}

console.log("버스 위치 추적 시작...");
fetchBusLocationData();
setInterval(fetchBusLocationData, 60000);
setInterval(cleanupOldJourneys, 300000);
