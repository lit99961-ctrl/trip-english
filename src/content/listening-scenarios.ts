import type { ListeningScenario } from "../domain/content-schema";

export const listeningScenariosByMission = {
  "hotel-checkin": [
    {
      id: "hotel-checkin-room-ready",
      transcript: "Your room is ready now.",
      meaningZh: "房间现在已经准备好了。",
      distractorsZh: ["房间三点以后才准备好。", "早餐七点开始。"],
      keywords: ["room", "ready", "now"]
    },
    {
      id: "hotel-checkin-room-later",
      transcript: "The room will be ready after three.",
      meaningZh: "房间三点以后才准备好。",
      distractorsZh: ["房间现在已经准备好了。", "需要出示火车票。"],
      keywords: ["room", "ready", "after", "three"]
    },
    {
      id: "hotel-checkin-breakfast-time",
      transcript: "Breakfast is from seven to ten.",
      meaningZh: "早餐时间是七点到十点。",
      distractorsZh: ["退房时间是七点。", "房间在十楼。"],
      keywords: ["breakfast", "seven", "ten"]
    }
  ],
  restaurant: [
    {
      id: "restaurant-wait-table",
      transcript: "We have a table, but you need to wait ten minutes.",
      meaningZh: "有桌位，但需要等十分钟。",
      distractorsZh: ["现在没有桌位。", "餐厅十点关门。"],
      keywords: ["table", "wait", "ten", "minutes"]
    },
    {
      id: "restaurant-pasta-sold-out",
      transcript: "Sorry, the pasta is sold out today.",
      meaningZh: "今天意面已经卖完了。",
      distractorsZh: ["今天意面半价。", "意面含有坚果。"],
      keywords: ["pasta", "sold out", "today"]
    },
    {
      id: "restaurant-no-nuts",
      transcript: "This dish does not contain nuts.",
      meaningZh: "这道菜不含坚果。",
      distractorsZh: ["这道菜含有坚果。", "这道菜今天没有。"],
      keywords: ["does not", "contain", "nuts"]
    }
  ],
  "directions-tickets": [
    {
      id: "directions-tickets-price",
      transcript: "A day ticket is eight euros.",
      meaningZh: "一日票是八欧元。",
      distractorsZh: ["一日票十八欧元。", "一日票八点开始使用。"],
      keywords: ["day ticket", "eight", "euros"]
    },
    {
      id: "directions-tickets-next-train",
      transcript: "The next train leaves at ten thirty.",
      meaningZh: "下一班火车十点半出发。",
      distractorsZh: ["下一班火车晚点三十分钟。", "售票处十点半关门。"],
      keywords: ["next train", "leaves", "ten thirty"]
    },
    {
      id: "directions-tickets-validate",
      transcript: "Yes, validate the ticket before you travel.",
      meaningZh: "需要在乘车前验票。",
      distractorsZh: ["不需要验票。", "需要在下车后买票。"],
      keywords: ["validate", "ticket", "before", "travel"]
    }
  ],
  "italy-high-speed-rail": [
    {
      id: "italy-high-speed-rail-platform-nine",
      transcript: "This train leaves from platform nine.",
      meaningZh: "这趟火车从九号站台出发。",
      distractorsZh: ["这趟火车九点出发。", "九号站台已经关闭。"],
      keywords: ["train", "leaves", "platform", "nine"]
    },
    {
      id: "italy-high-speed-rail-delay-twenty",
      transcript: "The train is delayed by twenty minutes.",
      meaningZh: "火车晚点二十分钟。",
      distractorsZh: ["火车二十点出发。", "火车已经取消。"],
      keywords: ["train", "delayed", "twenty", "minutes"]
    },
    {
      id: "italy-high-speed-rail-cancelled",
      transcript: "The train is cancelled. Take the next one.",
      meaningZh: "火车取消了，需要乘坐下一班。",
      distractorsZh: ["火车只是晚点。", "下一班火车也取消了。"],
      keywords: ["train", "cancelled", "next"]
    }
  ],
  "supermarket-groceries": [
    {
      id: "supermarket-groceries-per-kilo",
      transcript: "The price is four euros per kilo.",
      meaningZh: "价格是每公斤四欧元。",
      distractorsZh: ["总价是十四欧元。", "只能买四公斤。"],
      keywords: ["price", "four", "euros", "kilo"]
    },
    {
      id: "supermarket-groceries-weigh-first",
      transcript: "Please weigh it before checkout.",
      meaningZh: "需要在结账前称重。",
      distractorsZh: ["需要在结账后称重。", "不需要称重。"],
      keywords: ["weigh", "before", "checkout"]
    },
    {
      id: "supermarket-groceries-card-failed",
      transcript: "Your card did not work. Please try again.",
      meaningZh: "刷卡失败，需要再试一次。",
      distractorsZh: ["刷卡成功了。", "这里只能使用现金。"],
      keywords: ["card", "did not work", "try again"]
    }
  ]
} as const satisfies Record<string, readonly ListeningScenario[]>;
