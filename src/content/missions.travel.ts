import { z } from "zod";
import { missionSchema, type Mission } from "../domain/content-schema";
import { deepFreeze, type DeepReadonly } from "./content-validation";

type PhraseDraft = readonly [string, string, string, string, readonly string[], readonly (readonly string[])[], boolean?];

function travelMission(
  id: string,
  titleZh: string,
  city: string,
  recognitionWords: readonly string[],
  variation: Record<string, string>,
  promptTemplate: string,
  readingText: string,
  roleplayPhraseSuffix: string,
  activeSuffixes: readonly string[],
  phrases: readonly PhraseDraft[]
): Mission {
  return {
    id,
    kind: "travel",
    titleZh,
    city,
    recognitionWords: [...recognitionWords],
    productionPhrases: phrases.map(([suffix, english, chinese, intent, keywords, requiredKeywordGroups, recovery]) => ({
      id: `${id}-${suffix}`,
      english,
      chinese,
      intent,
      keywords: [...keywords],
      requiredKeywordGroups: requiredKeywordGroups.map((group) => [...group]),
      recovery: recovery ?? false,
      activeTarget: activeSuffixes.includes(suffix)
    })),
    exercises: [
      { id: `${id}-intent`, type: "intent", phraseId: `${id}-${phrases[0]![0]}`, promptZh: "听一句话，选出它要解决的事。" },
      { id: `${id}-shadow-1`, type: "shadow", phraseId: `${id}-${phrases[0]![0]}`, promptZh: "跟读第一句，注意关键词。" },
      { id: `${id}-shadow-2`, type: "shadow", phraseId: `${id}-${phrases[1]![0]}`, promptZh: "再跟读一句，换一个表达。" },
      { id: `${id}-recall`, type: "recall", phraseId: `${id}-${phrases[2]![0]}`, promptZh: "不看提示，说出这句话。" },
      { id: `${id}-roleplay`, type: "roleplay", phraseId: `${id}-${roleplayPhraseSuffix}`, promptZh: "按给定小变化完成一轮对话。", variation, promptTemplate },
      { id: `${id}-reading`, type: "reading", phraseId: `${id}-${phrases[4]![0]}`, promptZh: "读一条现场标识或提示，找出关键信息。", readingText, questions: [{ promptZh: "标识中的关键信息是什么？", expectedAnswers: [readingText] }] }
    ]
  };
}

const travelMissionSource: readonly Mission[] = [
  travelMission("hk-checkin", "香港机场值机", "Hong Kong", ["check-in", "passport", "baggage", "gate"], { bag: "one bag", seat: "window" }, "I have {bag}. Can I have a {seat} seat?", "CHECK-IN CLOSES BEFORE DEPARTURE", "bag", ["check-in", "passport"], [
    ["check-in", "I would like to check in.", "我想办理值机。", "check-in", ["check in", "flight"], [["want", "like"], ["check in"]]],
    ["passport", "Here is my passport.", "这是我的护照。", "show-passport", ["passport", "document"], [["here", "show"], ["passport"]]],
    ["bag", "I have one bag to check.", "我有一个行李要托运。", "check-bag", ["bag", "baggage"], [["bag", "baggage"]]],
    ["seat", "Can I have a window seat?", "我可以要靠窗座位吗？", "request-seat", ["window", "seat"], [["window"], ["seat"]]],
    ["gate", "Which gate is it?", "是哪个登机口？", "find-gate", ["gate", "boarding"], [["where", "which", "find"], ["gate"]]],
    ["repeat", "Could you say the gate again slowly?", "您能慢一点再说一遍登机口吗？", "recover-gate", ["again", "slowly"], [["again", "repeat"], ["slowly"]], true]
  ]),
  travelMission("helsinki-transfer", "赫尔辛基转机", "Helsinki", ["transfer", "security", "departure", "gate"], { gate: "32", time: "20 minutes" }, "Is gate {gate} this way? I have {time}.", "TRANSFER SECURITY → GATES 31–36", "gate", ["transfer", "security"], [
    ["transfer", "I am connecting to Rome.", "我要转机去罗马。", "state-connection", ["connecting", "Rome"], [["connecting", "connection"], ["Rome"]]],
    ["security", "Where is transfer security?", "转机安检在哪里？", "find-security", ["transfer", "security"], [["where", "find"], ["transfer security", "security"]]],
    ["gate", "Is gate 32 this way?", "32号登机口是这边吗？", "confirm-gate", ["gate", "this way"], [["is gate", "gate 32"], ["this way"]]],
    ["time", "Do I have enough time?", "我的时间够吗？", "ask-time", ["enough", "time"], [["enough"], ["time"]]],
    ["departure", "What time does boarding start?", "几点开始登机？", "ask-boarding-time", ["boarding", "start"], [["boarding"], ["start"]]],
    ["passport", "Where is passport control?", "护照检查在哪里？", "find-passport-control", ["passport", "control"], [["passport control", "passport"]]],
    ["show", "Could you show me on the screen?", "您能在屏幕上给我看吗？", "recover-screen", ["show", "screen"], [["show", "point"], ["screen"]], true]
  ]),
  travelMission("rome-arrival", "罗马抵达", "Rome", ["arrivals", "baggage claim", "train", "ticket"], { train: "Leonardo Express", quantity: "two" }, "I need {quantity} tickets for the {train}.", "LEONARDO EXPRESS — ROME TERMINI — TICKETS", "express", ["arrivals", "baggage"], [
    ["arrivals", "Where is the arrivals exit?", "到达出口在哪里？", "find-arrivals-exit", ["arrivals", "exit"], [["where", "find"], ["arrivals"], ["exit"]]],
    ["baggage", "Where is baggage claim?", "行李提取处在哪里？", "find-baggage", ["baggage", "claim"], [["where", "find"], ["baggage claim", "baggage"]]],
    ["lost-bag", "My bag is not here.", "我的行李不在这里。", "report-missing-bag", ["bag", "missing"], [["bag", "baggage"], ["not here", "missing", "lost"]]],
    ["express", "Where is the Leonardo Express?", "Leonardo Express在哪里？", "find-airport-train", ["Leonardo", "Express"], [["Leonardo Express", "Leonardo", "Express"]]],
    ["ticket", "I need a ticket to Rome.", "我需要一张去罗马的票。", "buy-ticket", ["ticket", "Rome"], [["ticket"], ["Rome"]]],
    ["understand", "I don't understand. Could you point it out?", "我不明白。您能指给我看吗？", "recover-direction", ["understand", "point it out"], [["do not understand", "don't understand", "not understand"], ["point", "show"]], true]
  ]),
  travelMission("hotel-checkin", "酒店入住", "Rome and Lucerne", ["reservation", "self check-in", "key card", "breakfast", "Wi-Fi"], { keys: "two", room: "ready" }, "Is the room {room}? May I have {keys} key cards?", "SELF CHECK-IN: USE YOUR NAME AT THE KIOSK", "key", ["reservation", "name", "room"], [
    ["reservation", "I have a reservation.", "我有预订。", "check-reservation", ["reservation", "booking"], [["have", "booked"], ["reservation", "booking"]]],
    ["name", "The name is Li.", "名字是李。", "give-name", ["name", "Li"], [["name"], ["Li"]]],
    ["room", "Is the room ready?", "房间准备好了吗？", "ask-room-status", ["room", "ready"], [["room"], ["ready"]]],
    ["key", "May I have two key cards?", "我可以要两张房卡吗？", "request-keys", ["key", "card"], [["key card", "key cards", "key"]]],
    ["self-checkin", "How do I use self check-in?", "我怎么使用自助入住？", "ask-self-check-in", ["self check-in", "use"], [["self check in"]]],
    ["breakfast", "What time is breakfast?", "早餐几点开始？", "ask-breakfast", ["breakfast", "time"], [["breakfast"]]],
    ["wifi", "Could you show me the Wi-Fi password?", "您能给我看一下Wi-Fi密码吗？", "recover-wifi", ["show", "Wi-Fi"], [["wi fi", "wifi"], ["password"]], true]
  ]),
  travelMission("directions-tickets", "问路和买票", "Rome and Vatican", ["entrance", "ticket", "metro", "Vatican Museums", "opening time"], { entrance: "B", ticket: "day ticket" }, "Where is entrance {entrance}? I need a {ticket}.", "VATICAN MUSEUMS — OPENING TIMES — LAST ENTRY", "entrance", ["direction", "entrance", "ticket"], [
    ["direction", "How do I get to the metro?", "我怎么去地铁？", "ask-direction", ["how", "metro"], [["how", "where"], ["metro"]]],
    ["entrance", "Where is entrance B?", "B入口在哪里？", "find-entrance", ["entrance", "B"], [["where", "find"], ["entrance"], ["B"]]],
    ["ticket", "How much is a day ticket?", "一日票多少钱？", "ask-price", ["how much", "day ticket"], [["day ticket"], ["how much", "price"]]],
    ["walk", "Can I walk there?", "我可以走路去那里吗？", "ask-walking", ["walk", "there"], [["walk"]]],
    ["vatican", "What time do the Vatican Museums open?", "梵蒂冈博物馆几点开门？", "ask-opening-time", ["Vatican Museums", "open"], [["Vatican Museums", "Vatican"], ["open", "opening"]]],
    ["time", "How long does it take?", "要多久？", "ask-duration", ["how long", "take"], [["how long"]]],
    ["repeat", "Please say the street name again.", "请再说一遍街道名。", "recover-name", ["again", "name"], [["street name", "name"], ["again", "repeat"]], true]
  ]),
  travelMission("restaurant", "餐厅点餐", "Florence", ["table", "menu", "water", "allergy", "bill"], { table: "two people", item: "pasta" }, "A table for {table}. I would like {item}.", "MENU NOTICE: PLEASE TELL US ABOUT ALLERGIES", "table", ["table", "menu", "order"], [
    ["table", "A table for two, please.", "请给两个人一张桌子。", "request-table", ["table", "two"], [["table"], ["two", "2"]]],
    ["menu", "May I see the menu?", "我可以看菜单吗？", "request-menu", ["menu", "see"], [["see", "have"], ["menu"]]],
    ["order", "I would like this pasta.", "我想要这份意面。", "order-food", ["pasta", "this"], [["like", "want"], ["pasta"]]],
    ["water", "Still water, please.", "请给不带气的水。", "order-water", ["still", "water"], [["still"], ["water"]]],
    ["allergy", "I have a nut allergy.", "我对坚果过敏。", "state-allergy", ["nut", "allergy"], [["nut"], ["allergy", "allergic"]]],
    ["bill", "Could I have the bill, please?", "请给我账单，好吗？", "request-bill", ["bill", "please"], [["bill", "check"]]],
    ["point-menu", "Could you point to it on the menu?", "您能在菜单上指给我看吗？", "recover-menu", ["point", "menu"], [["point", "show"], ["menu"]], true]
  ]),
  travelMission("italy-high-speed-rail", "意大利高铁", "Rome–Florence–Venice", ["platform", "carriage", "seat", "delay", "departure"], { platform: "9", carriage: "4" }, "Is this train on platform {platform}? Where is carriage {carriage}?", "DEPARTURES: FLORENCE / VENICE — PLATFORM 9", "platform", ["train", "platform"], [
    ["train", "Is this the train to Florence?", "这是去佛罗伦萨的火车吗？", "confirm-train", ["train", "Florence"], [["train"], ["Florence"]]],
    ["platform", "Which platform is it?", "是哪个站台？", "find-platform", ["platform", "track"], [["where", "which", "is this"], ["platform", "track"]]],
    ["car", "Where is carriage four?", "4号车厢在哪里？", "find-carriage", ["carriage", "four"], [["carriage"], ["four", "4"]]],
    ["seat", "Is this seat 12A?", "这是12A座位吗？", "confirm-seat", ["seat", "12A"], [["seat"], ["12A"]]],
    ["delay", "Is the train delayed?", "火车晚点了吗？", "ask-delay", ["delayed", "train"], [["train"], ["delayed", "delay", "late"]]],
    ["help", "Could you help me find my seat?", "您能帮我找座位吗？", "recover-seat", ["help", "seat"], [["find"], ["seat"]], true]
  ]),
  travelMission("venice-vaporetto", "威尼斯水上巴士", "Venice", ["vaporetto", "stop", "line", "validate", "get off"], { line: "1", stop: "Rialto" }, "Does line {line} stop at {stop}?", "LINE 1 — RIALTO — VALIDATE TICKET", "line", ["stop", "line"], [
    ["stop", "Which stop is for Rialto?", "去里亚托是哪一站？", "find-stop", ["stop", "Rialto"], [["stop"], ["Rialto"]]],
    ["line", "Does line one go there?", "1号线去那里吗？", "confirm-line", ["line", "go"], [["line"], ["go", "stop"]]],
    ["ticket", "Where can I buy a ticket?", "我在哪里可以买票？", "buy-ticket", ["buy", "ticket"], [["buy"], ["ticket"]]],
    ["validate", "Do I need to validate it?", "我需要验票吗？", "ask-validation", ["validate", "ticket"], [["validate"]]],
    ["off", "Please tell me when to get off.", "请告诉我什么时候下船。", "ask-stop-alert", ["tell", "get off"], [["get off"]]],
    ["repeat", "Could you say the stop again?", "您能再说一遍站名吗？", "recover-stop", ["again", "stop"], [["stop"], ["again", "repeat"]], true]
  ]),
  travelMission("milan-swiss-transfer", "米兰转乘瑞士火车", "Milan–Interlaken", ["change", "platform", "border", "delay", "Interlaken"], { destination: "Interlaken", platform: "6" }, "Is this for {destination}? Which platform is {platform}?", "INTERLAKEN — CHANGE TRAINS — PLATFORM 6", "platform", ["interlaken", "change"], [
    ["interlaken", "Is this train for Interlaken?", "这趟车去因特拉肯吗？", "confirm-destination", ["train", "Interlaken"], [["train"], ["Interlaken"]]],
    ["change", "Where do I change trains?", "我在哪里换车？", "ask-change", ["change", "trains"], [["where"], ["change trains", "change"]]],
    ["platform", "Which platform does the next train leave from?", "下一趟火车从哪个站台出发？", "find-next-platform", ["platform", "leave from"], [["platform"]]],
    ["border", "Do we stop at the border?", "我们会在边境停吗？", "ask-border", ["border", "stop"], [["border"], ["stop"]]],
    ["delay", "Will I miss my connection?", "我会错过接驳车吗？", "ask-connection-risk", ["miss", "connection"], [["miss"], ["connection"]]],
    ["help", "I need help with this change.", "我需要换车方面的帮助。", "recover-transfer", ["help", "change"], [["help"], ["change"]], true]
  ]),
  travelMission("swiss-mountain-transit", "瑞士山区交通", "Zermatt–Gornergrat–Grindelwald–Lucerne", ["regional train", "cable car", "Grindelwald", "Interlaken", "Lungern", "Lucerne", "Zurich Airport", "weather", "last train"], { destination: "Lucerne", returnTime: "later" }, "Is this for {destination}? Is there a {returnTime} train back?", "TIMETABLE: LUNGERN STOP — LUCERNE — ZURICH AIRPORT", "return", ["train", "cable"], [
    ["train", "Which train goes to Zermatt?", "哪趟火车去采尔马特？", "find-regional-train", ["train", "Zermatt"], [["which", "find"], ["train"], ["Zermatt"]]],
    ["cable", "Where is the cable car?", "缆车在哪里？", "find-cable-car", ["cable car", "lift"], [["where", "find"], ["cable car", "lift"]]],
    ["gornergrat", "Does this go to Gornergrat?", "这个去戈尔内格拉特吗？", "confirm-mountain-route", ["Gornergrat", "go"], [["Gornergrat"]]],
    ["weather", "Is the weather safe today?", "今天天气安全吗？", "ask-weather", ["weather", "safe"], [["weather"], ["safe"]]],
    ["return", "What is the last train back?", "最后一趟回程火车是几点？", "ask-last-return", ["last", "back"], [["train"], ["back"]]],
    ["lungern", "Does this train stop at Lungern?", "这趟火车停靠伦根吗？", "confirm-lungern-stop", ["stop", "Lungern"], [["Lungern"], ["stop"]]],
    ["zurich-airport", "I need the train to Zurich Airport.", "我需要去苏黎世机场的火车。", "find-zurich-airport-train", ["train", "Zurich Airport"], [["Zurich Airport"]]],
    ["slowly", "Please speak slowly. I am new here.", "请慢一点说。我刚来这里。", "recover-slowly", ["slowly", "new"], [["slowly"]], true]
  ]),
  travelMission("shopping-tax-refund", "购物和退税", "Milan", ["size", "color", "card", "tax-free", "refund"], { size: "medium", color: "blue" }, "Do you have this in {size} and {color}?", "TAX-FREE: PASSPORT REQUIRED FOR REFUND FORM", "size", ["size", "color"], [
    ["size", "Do you have this in medium?", "这个有中码吗？", "ask-size", ["medium", "size"], [["do you have", "have this"], ["medium"]]],
    ["color", "Do you have it in blue?", "有蓝色的吗？", "ask-color", ["blue", "color"], [["do you have", "have it"], ["blue"]]],
    ["price", "How much is this?", "这个多少钱？", "ask-price", ["how much", "price"], [["how much", "price"]]],
    ["card", "Can I pay by card?", "我可以刷卡吗？", "ask-card-payment", ["card", "pay"], [["card"]]],
    ["taxfree", "Can I get a tax-free form?", "我可以拿退税单吗？", "request-tax-free", ["tax-free", "form"], [["tax free"], ["form"]]],
    ["show", "Could you show me where to sign?", "您能告诉我在哪里签字吗？", "recover-form", ["show", "sign"], [["sign"]], true]
  ]),
  travelMission("urgent-help", "紧急求助", "Italy and Switzerland", ["lost", "toilet", "police", "doctor", "pharmacy", "112", "location", "bag"], { place: "the station entrance", help: "a police officer" }, "I am lost at {place}. I need {help}.", "WC / TOILET → EMERGENCY 112", "police", ["lost-separated", "phone", "bag"], [
    ["lost-separated", "I am lost and separated from my group.", "我迷路了，和同伴走散了。", "report-lost-and-separated", ["lost", "separated"], [["lost"], ["separated"]]],
    ["phone", "My phone is out of battery. Can I charge it?", "我的手机没电了。我可以充电吗？", "request-phone-charge", ["phone", "battery", "charge"], [["phone"], ["battery", "charge"]]],
    ["bag", "My bag is missing.", "我的包不见了。", "report-missing-bag", ["bag", "missing"], [["bag"], ["missing", "lost"]]],
    ["medical", "I need a doctor.", "我需要医生。", "request-doctor", ["doctor", "medical"], [["doctor"]]],
    ["police", "Where can I find a police officer?", "我在哪里能找到警察？", "find-police", ["police", "officer"], [["police", "police officer"]]],
    ["toilet", "Where is the nearest toilet?", "最近的洗手间在哪里？", "find-toilet", ["nearest", "toilet"], [["toilet", "WC"]]],
    ["location", "Could you show me this location on the map?", "您能在地图上给我看这个位置吗？", "recover-location", ["show", "location", "map"], [["location"], ["map"]], true],
    ["emergency", "Please call 112. I need help.", "请拨打112。我需要帮助。", "request-emergency-call", ["112", "help"], [["112"], ["call"]]]
  ])
];

export const travelMissions: DeepReadonly<readonly Mission[]> = deepFreeze(
  z.array(missionSchema).parse(travelMissionSource)
);
