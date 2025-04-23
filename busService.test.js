const axios = require("axios");
const MockAdapter = require("axios-mock-adapter");
const busService = require("./busService");

const mock = new MockAdapter(axios);

describe("버스 서비스 테스트", () => {
  afterEach(() => {
    mock.reset();
  });

  test("XML 응답을 파싱할 수 있어야 함", async () => {
    const xmlData = `
      <ServiceResult>
        <comMsgHeader/>
        <msgHeader>
          <numOfRows>1</numOfRows>
          <pageNo>1</pageNo>
          <resultCode>0</resultCode>
          <resultMsg>정상적으로 처리되었습니다.</resultMsg>
          <totalCount>1</totalCount>
        </msgHeader>
        <msgBody>
          <itemList>
            <BUSID>7231122</BUSID>
            <BUS_NUM_PLATE>인천72아1122</BUS_NUM_PLATE>
            <CONGESTION>255</CONGESTION>
            <DIRCD>1</DIRCD>
            <LASTBUSYN>0</LASTBUSYN>
            <LATEST_STOPSEQ>51</LATEST_STOPSEQ>
            <LATEST_STOP_ID>164000061</LATEST_STOP_ID>
            <LATEST_STOP_NAME>현대1차아파트</LATEST_STOP_NAME>
            <LOW_TP_CD>0</LOW_TP_CD>
            <PATHSEQ>215</PATHSEQ>
            <REMAIND_SEAT>38</REMAIND_SEAT>
            <ROUTEID>165000245</ROUTEID>
          </itemList>
        </msgBody>
      </ServiceResult>
    `;

    const result = await busService.parseXmlResponse(xmlData);

    expect(result).toBeDefined();
    expect(result.ServiceResult).toBeDefined();
    expect(result.ServiceResult.msgHeader.resultCode).toBe("0");
    expect(result.ServiceResult.msgBody.itemList.BUS_NUM_PLATE).toBe(
      "인천72아1122"
    );
  });

  test("API에서 버스 위치 데이터를 가져올 수 있어야 함", async () => {
    const mockXmlResponse = `
      <ServiceResult>
        <comMsgHeader/>
        <msgHeader>
          <numOfRows>2</numOfRows>
          <pageNo>1</pageNo>
          <resultCode>0</resultCode>
          <resultMsg>정상적으로 처리되었습니다.</resultMsg>
          <totalCount>2</totalCount>
        </msgHeader>
        <msgBody>
          <itemList>
            <BUSID>7231122</BUSID>
            <BUS_NUM_PLATE>인천72아1122</BUS_NUM_PLATE>
            <CONGESTION>255</CONGESTION>
            <DIRCD>1</DIRCD>
            <LASTBUSYN>0</LASTBUSYN>
            <LATEST_STOPSEQ>51</LATEST_STOPSEQ>
            <LATEST_STOP_ID>164000061</LATEST_STOP_ID>
            <LATEST_STOP_NAME>현대1차아파트</LATEST_STOP_NAME>
            <LOW_TP_CD>0</LOW_TP_CD>
            <PATHSEQ>215</PATHSEQ>
            <REMAIND_SEAT>38</REMAIND_SEAT>
            <ROUTEID>165000245</ROUTEID>
          </itemList>
          <itemList>
            <BUSID>7231123</BUSID>
            <BUS_NUM_PLATE>인천72아1123</BUS_NUM_PLATE>
            <CONGESTION>255</CONGESTION>
            <DIRCD>1</DIRCD>
            <LASTBUSYN>0</LASTBUSYN>
            <LATEST_STOPSEQ>43</LATEST_STOPSEQ>
            <LATEST_STOP_ID>277103806</LATEST_STOP_ID>
            <LATEST_STOP_NAME>연성IC(미정차)</LATEST_STOP_NAME>
            <LOW_TP_CD>0</LOW_TP_CD>
            <PATHSEQ>181</PATHSEQ>
            <REMAIND_SEAT>20</REMAIND_SEAT>
            <ROUTEID>165000245</ROUTEID>
          </itemList>
        </msgBody>
      </ServiceResult>
    `;

    mock.onGet("http://test-api/bus").reply(200, mockXmlResponse);

    const busItems = await busService.fetchBusLocationData(
      "http://test-api/bus"
    );

    expect(busItems).toHaveLength(2);
    expect(busItems[0].BUS_NUM_PLATE).toBe("인천72아1122");
    expect(busItems[1].BUS_NUM_PLATE).toBe("인천72아1123");
  });

  test("API 오류 응답 처리 테스트", async () => {
    const errorXmlResponse = `
      <ServiceResult>
        <comMsgHeader/>
        <msgHeader>
          <resultCode>500</resultCode>
          <resultMsg>서버 오류가 발생했습니다.</resultMsg>
        </msgHeader>
      </ServiceResult>
    `;

    mock.onGet("http://test-api/bus").reply(200, errorXmlResponse);

    await expect(
      busService.fetchBusLocationData("http://test-api/bus")
    ).rejects.toThrow("API 오류: 서버 오류가 발생했습니다.");
  });

  test("종점 도착 확인 기능 테스트", () => {
    const endStations = {
      1: "시대아파트",
      2: "성호아파트",
    };

    expect(busService.isBusAtEndStation("시대아파트", "1", endStations)).toBe(
      true
    );
    expect(busService.isBusAtEndStation("성호아파트", "2", endStations)).toBe(
      true
    );
    expect(busService.isBusAtEndStation("연수구청", "1", endStations)).toBe(
      false
    );
  });

  test("현재 날짜 및 시간 포맷팅 테스트", () => {
    const realDate = Date;
    const mockDate = new Date(2023, 4, 15, 14, 30);

    global.Date = class extends Date {
      constructor() {
        return mockDate;
      }
    };

    const dateTime = busService.getCurrentFormattedDateTime();

    expect(dateTime.date).toBe("2023.05.15");
    expect(dateTime.time).toBe("14:30");
    expect(dateTime.dateTime).toBe("2023.05.15 14:30");

    global.Date = realDate;
  });
});
