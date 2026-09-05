import type { Mission } from "../domain/content-schema";

type PhraseDraft = readonly [string, string, string, string, readonly string[], boolean?];

function travelMission(
  id: string,
  titleZh: string,
  city: string,
  recognitionWords: readonly string[],
  variation: Record<string, string>,
  phrases: readonly PhraseDraft[]
): Mission {
  return {
    id,
    kind: "travel",
    titleZh,
    city,
    recognitionWords: [...recognitionWords],
    productionPhrases: phrases.map(([suffix, english, chinese, intent, keywords, recovery], index) => ({
      id: `${id}-${suffix}`,
      english,
      chinese,
      intent,
      keywords: [...keywords],
      recovery: recovery ?? false,
      activeTarget: index < 2
    })),
    exercises: [
      { id: `${id}-intent`, type: "intent", phraseId: `${id}-${phrases[0]![0]}`, promptZh: "听一句话，选出它要解决的事。" },
      { id: `${id}-shadow-1`, type: "shadow", phraseId: `${id}-${phrases[0]![0]}`, promptZh: "跟读第一句，注意关键词。" },
      { id: `${id}-shadow-2`, type: "shadow", phraseId: `${id}-${phrases[1]![0]}`, promptZh: "再跟读一句，换一个表达。" },
      { id: `${id}-recall`, type: "recall", phraseId: `${id}-${phrases[2]![0]}`, promptZh: "不看提示，说出这句话。" },
      { id: `${id}-roleplay`, type: "roleplay", phraseId: `${id}-${phrases[3]![0]}`, promptZh: "按给定小变化完成一轮对话。", variation },
      { id: `${id}-reading`, type: "reading", phraseId: `${id}-${phrases[4]![0]}`, promptZh: "读一条现场标识或提示，找出关键信息。" }
    ]
  };
}

export const travelMissions: readonly Mission[] = [
  travelMission("hk-checkin", "香港机场值机", "Hong Kong", ["check-in", "passport", "baggage", "gate"], { bag: "one suitcase", seat: "window" }, [
    ["check-in", "I would like to check in.", "我想办理值机。", "check-in", ["check in", "flight"]],
    ["passport", "Here is my passport.", "这是我的护照。", "show-passport", ["passport", "document"]],
    ["bag", "I have one bag to check.", "我有一个行李要托运。", "check-bag", ["bag", "baggage"]],
    ["seat", "Can I have a window seat?", "我可以要靠窗座位吗？", "request-seat", ["window", "seat"]],
    ["gate", "Which gate is it?", "是哪个登机口？", "find-gate", ["gate", "boarding"]],
    ["repeat", "Could you say the gate again slowly?", "您能慢一点再说一遍登机口吗？", "recover-gate", ["again", "slowly"], true]
  ]),
  travelMission("helsinki-transfer", "赫尔辛基转机", "Helsinki", ["transfer", "security", "departure", "gate"], { gate: "32", time: "20 minutes" }, [
    ["transfer", "I am connecting to Rome.", "我要转机去罗马。", "state-connection", ["connecting", "Rome"]],
    ["security", "Where is transfer security?", "转机安检在哪里？", "find-security", ["transfer", "security"]],
    ["gate", "Is gate 32 this way?", "32号登机口是这边吗？", "confirm-gate", ["gate", "this way"]],
    ["time", "Do I have enough time?", "我的时间够吗？", "ask-time", ["enough", "time"]],
    ["departure", "What time does boarding start?", "几点开始登机？", "ask-boarding-time", ["boarding", "start"]],
    ["show", "Could you show me on the screen?", "您能在屏幕上给我看吗？", "recover-screen", ["show", "screen"], true]
  ]),
  travelMission("rome-arrival", "罗马抵达", "Rome", ["passport control", "baggage claim", "train", "ticket"], { train: "Leonardo Express", quantity: "two tickets" }, [
    ["control", "Where is passport control?", "护照检查在哪里？", "find-immigration", ["passport", "control"]],
    ["baggage", "Where is baggage claim?", "行李提取处在哪里？", "find-baggage", ["baggage", "claim"]],
    ["lost-bag", "My bag is not here.", "我的行李不在这里。", "report-missing-bag", ["bag", "missing"]],
    ["express", "Where is the Leonardo Express?", "Leonardo Express在哪里？", "find-airport-train", ["Leonardo", "Express"]],
    ["ticket", "I need a ticket to Rome.", "我需要一张去罗马的票。", "buy-ticket", ["ticket", "Rome"]],
    ["understand", "I don't understand. Could you point there?", "我不明白。您能指一下那里吗？", "recover-direction", ["understand", "point"], true]
  ]),
  travelMission("hotel-checkin", "酒店入住", "Rome", ["reservation", "passport", "key card", "breakfast", "Wi-Fi"], { breakfast: "7:00", room: "two keys" }, [
    ["reservation", "I have a reservation.", "我有预订。", "check-reservation", ["reservation", "booking"]],
    ["name", "The name is Li.", "名字是李。", "give-name", ["name", "Li"]],
    ["room", "Is the room ready?", "房间准备好了吗？", "ask-room-status", ["room", "ready"]],
    ["key", "May I have two key cards?", "我可以要两张房卡吗？", "request-keys", ["key", "card"]],
    ["breakfast", "What time is breakfast?", "早餐几点开始？", "ask-breakfast", ["breakfast", "time"]],
    ["wifi", "Could you show me the Wi-Fi password?", "您能给我看一下Wi-Fi密码吗？", "recover-wifi", ["show", "Wi-Fi"], true]
  ]),
  travelMission("directions-tickets", "问路和买票", "Rome", ["entrance", "ticket", "metro", "left", "right"], { entrance: "B", ticket: "24-hour" }, [
    ["direction", "How do I get to the metro?", "我怎么去地铁？", "ask-direction", ["how", "metro"]],
    ["entrance", "Where is entrance B?", "B入口在哪里？", "find-entrance", ["entrance", "B"]],
    ["ticket", "How much is a day ticket?", "一日票多少钱？", "ask-price", ["how much", "day ticket"]],
    ["walk", "Can I walk there?", "我可以走路去那里吗？", "ask-walking", ["walk", "there"]],
    ["time", "How long does it take?", "要多久？", "ask-duration", ["how long", "take"]],
    ["repeat", "Please say the street name again.", "请再说一遍街道名。", "recover-name", ["again", "name"], true]
  ]),
  travelMission("restaurant", "餐厅点餐", "Florence", ["table", "menu", "water", "allergy", "bill"], { table: "two people", item: "pasta" }, [
    ["table", "A table for two, please.", "请给两个人一张桌子。", "request-table", ["table", "two"]],
    ["menu", "May I see the menu?", "我可以看菜单吗？", "request-menu", ["menu", "see"]],
    ["order", "I would like this pasta.", "我想要这份意面。", "order-food", ["pasta", "this"]],
    ["water", "Still water, please.", "请给不带气的水。", "order-water", ["still", "water"]],
    ["allergy", "I have a nut allergy.", "我对坚果过敏。", "state-allergy", ["nut", "allergy"]],
    ["bill", "Could I have the bill, please?", "请给我账单，好吗？", "request-bill", ["bill", "please"], true]
  ]),
  travelMission("italy-high-speed-rail", "意大利高铁", "Rome–Florence–Venice", ["platform", "carriage", "seat", "delay", "departure"], { platform: "9", carriage: "4" }, [
    ["train", "Is this the train to Florence?", "这是去佛罗伦萨的火车吗？", "confirm-train", ["train", "Florence"]],
    ["platform", "Which platform is it?", "是哪个站台？", "find-platform", ["platform", "track"]],
    ["car", "Where is carriage four?", "4号车厢在哪里？", "find-carriage", ["carriage", "four"]],
    ["seat", "Is this seat 12A?", "这是12A座位吗？", "confirm-seat", ["seat", "12A"]],
    ["delay", "Is the train delayed?", "火车晚点了吗？", "ask-delay", ["delayed", "train"]],
    ["help", "Could you help me find my seat?", "您能帮我找座位吗？", "recover-seat", ["help", "seat"], true]
  ]),
  travelMission("venice-vaporetto", "威尼斯水上巴士", "Venice", ["vaporetto", "stop", "line", "validate", "get off"], { line: "1", stop: "Rialto" }, [
    ["stop", "Which stop is for Rialto?", "去里亚托是哪一站？", "find-stop", ["stop", "Rialto"]],
    ["line", "Does line one go there?", "1号线去那里吗？", "confirm-line", ["line", "go"]],
    ["ticket", "Where can I buy a ticket?", "我在哪里可以买票？", "buy-ticket", ["buy", "ticket"]],
    ["validate", "Do I need to validate it?", "我需要验票吗？", "ask-validation", ["validate", "ticket"]],
    ["off", "Please tell me when to get off.", "请告诉我什么时候下船。", "ask-stop-alert", ["tell", "get off"]],
    ["repeat", "Could you say the stop again?", "您能再说一遍站名吗？", "recover-stop", ["again", "stop"], true]
  ]),
  travelMission("milan-swiss-transfer", "米兰转乘瑞士火车", "Milan–Interlaken", ["change", "platform", "border", "delay", "Interlaken"], { platform: "6", change: "one train" }, [
    ["interlaken", "Is this train for Interlaken?", "这趟车去因特拉肯吗？", "confirm-destination", ["train", "Interlaken"]],
    ["change", "Where do I change trains?", "我在哪里换车？", "ask-change", ["change", "trains"]],
    ["platform", "Which platform is next?", "下一趟是哪个站台？", "find-next-platform", ["platform", "next"]],
    ["border", "Do we stop at the border?", "我们会在边境停吗？", "ask-border", ["border", "stop"]],
    ["delay", "Will I miss my connection?", "我会错过接驳车吗？", "ask-connection-risk", ["miss", "connection"]],
    ["help", "I need help with this change.", "我需要换车方面的帮助。", "recover-transfer", ["help", "change"], true]
  ]),
  travelMission("swiss-mountain-transit", "瑞士山区交通", "Zermatt–Gornergrat–Grindelwald", ["regional train", "cable car", "weather", "last train", "return"], { return: "17:30", weather: "snow" }, [
    ["train", "Which train goes to Zermatt?", "哪趟火车去采尔马特？", "find-regional-train", ["train", "Zermatt"]],
    ["cable", "Where is the cable car?", "缆车在哪里？", "find-cable-car", ["cable car", "lift"]],
    ["gornergrat", "Does this go to Gornergrat?", "这个去戈尔内格拉特吗？", "confirm-mountain-route", ["Gornergrat", "go"]],
    ["weather", "Is the weather safe today?", "今天天气安全吗？", "ask-weather", ["weather", "safe"]],
    ["return", "What is the last train back?", "最后一趟回程火车是几点？", "ask-last-return", ["last", "back"]],
    ["slowly", "Please speak slowly. I am new here.", "请慢一点说。我刚来这里。", "recover-slowly", ["slowly", "new"], true]
  ]),
  travelMission("shopping-tax-refund", "购物和退税", "Milan", ["size", "color", "card", "tax-free", "refund"], { size: "medium", color: "blue" }, [
    ["size", "Do you have this in medium?", "这个有中码吗？", "ask-size", ["medium", "size"]],
    ["color", "Do you have it in blue?", "有蓝色的吗？", "ask-color", ["blue", "color"]],
    ["price", "How much is this?", "这个多少钱？", "ask-price", ["how much", "price"]],
    ["card", "Can I pay by card?", "我可以刷卡吗？", "ask-card-payment", ["card", "pay"]],
    ["taxfree", "Can I get a tax-free form?", "我可以拿退税单吗？", "request-tax-free", ["tax-free", "form"]],
    ["show", "Could you show me where to sign?", "您能告诉我在哪里签字吗？", "recover-form", ["show", "sign"], true]
  ]),
  travelMission("urgent-help", "紧急求助", "Italy and Switzerland", ["lost", "police", "doctor", "pharmacy", "112", "location"], { place: "station entrance", help: "police" }, [
    ["lost", "I am lost. Please help me.", "我迷路了。请帮帮我。", "ask-help", ["lost", "help"]],
    ["separated", "I am separated from my group.", "我和同伴走散了。", "report-separated", ["separated", "group"]],
    ["phone", "My phone is missing.", "我的手机不见了。", "report-phone", ["phone", "missing"]],
    ["medical", "I need a doctor.", "我需要医生。", "request-doctor", ["doctor", "medical"]],
    ["police", "Where can I find a police officer?", "我在哪里能找到警察？", "find-police", ["police", "officer"]],
    ["emergency", "Please call 112. I need help.", "请拨打112。我需要帮助。", "request-emergency-call", ["112", "help"], true]
  ])
];
