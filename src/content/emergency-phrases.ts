export const emergencyCategories = [
  "airport",
  "hotel",
  "transport",
  "restaurant",
  "shopping",
  "medical",
  "general-help"
] as const;

export type EmergencyCategory = (typeof emergencyCategories)[number];

export interface EmergencyPhrase {
  readonly id: string;
  readonly category: EmergencyCategory;
  readonly english: string;
  readonly chinese: string;
  readonly keywords: readonly string[];
}

export const emergencyPhrases: readonly EmergencyPhrase[] = [
  { id: "em-airport-missed-flight", category: "airport", english: "I missed my flight. What can I do?", chinese: "我错过航班了。我该怎么办？", keywords: ["missed", "flight"] },
  { id: "em-airport-lost-baggage", category: "airport", english: "My baggage did not arrive.", chinese: "我的行李没有到。", keywords: ["baggage", "arrive"] },
  { id: "em-airport-wrong-gate", category: "airport", english: "Is this the right gate?", chinese: "这是正确的登机口吗？", keywords: ["right", "gate"] },
  { id: "em-airport-boarding-pass", category: "airport", english: "I cannot find my boarding pass.", chinese: "我找不到登机牌。", keywords: ["boarding pass", "find"] },
  { id: "em-airport-security-help", category: "airport", english: "I need help at security.", chinese: "我在安检处需要帮助。", keywords: ["security", "help"] },
  { id: "em-airport-connection", category: "airport", english: "My connection is very short.", chinese: "我的转机时间很短。", keywords: ["connection", "short"] },
  { id: "em-airport-screen", category: "airport", english: "Please show the new gate on the screen.", chinese: "请在屏幕上显示新的登机口。", keywords: ["show", "screen"] },
  { id: "em-airport-wheelchair", category: "airport", english: "I need a wheelchair, please.", chinese: "我需要轮椅，谢谢。", keywords: ["wheelchair", "need"] },

  { id: "em-hotel-wrong-room", category: "hotel", english: "This is not my room.", chinese: "这不是我的房间。", keywords: ["not", "room"] },
  { id: "em-hotel-key", category: "hotel", english: "My key card does not work.", chinese: "我的房卡不能用。", keywords: ["key card", "work"] },
  { id: "em-hotel-no-reservation", category: "hotel", english: "I cannot find my reservation.", chinese: "我找不到我的预订。", keywords: ["reservation", "find"] },
  { id: "em-hotel-noisy", category: "hotel", english: "The room is too noisy.", chinese: "房间太吵了。", keywords: ["room", "noisy"] },
  { id: "em-hotel-water", category: "hotel", english: "There is no hot water.", chinese: "没有热水。", keywords: ["hot water", "no"] },
  { id: "em-hotel-lock", category: "hotel", english: "The door will not lock.", chinese: "门锁不上。", keywords: ["door", "lock"] },
  { id: "em-hotel-lost-key", category: "hotel", english: "I lost my room key.", chinese: "我丢了房间钥匙。", keywords: ["lost", "key"] },
  { id: "em-hotel-reception", category: "hotel", english: "Can someone come to my room?", chinese: "可以有人来我的房间吗？", keywords: ["come", "room"] },

  { id: "em-transport-cancelled", category: "transport", english: "My train was cancelled.", chinese: "我的火车被取消了。", keywords: ["train", "cancelled"] },
  { id: "em-transport-wrong-train", category: "transport", english: "I am on the wrong train.", chinese: "我上错火车了。", keywords: ["wrong", "train"] },
  { id: "em-transport-missed-stop", category: "transport", english: "I missed my stop.", chinese: "我坐过站了。", keywords: ["missed", "stop"] },
  { id: "em-transport-next-train", category: "transport", english: "When is the next train?", chinese: "下一趟火车是什么时候？", keywords: ["next", "train"] },
  { id: "em-transport-platform", category: "transport", english: "Which platform should I use?", chinese: "我应该去哪个站台？", keywords: ["platform", "use"] },
  { id: "em-transport-ticket", category: "transport", english: "My ticket is not valid.", chinese: "我的票无效。", keywords: ["ticket", "valid"] },
  { id: "em-transport-taxi", category: "transport", english: "Please take me to this station.", chinese: "请带我去这个车站。", keywords: ["station", "take"] },
  { id: "em-transport-bus", category: "transport", english: "Does this bus go to the center?", chinese: "这辆公交车去市中心吗？", keywords: ["bus", "center"] },
  { id: "em-transport-last", category: "transport", english: "Is there a later train?", chinese: "还有更晚的火车吗？", keywords: ["later", "train"] },
  { id: "em-transport-map", category: "transport", english: "Please show me the route on a map.", chinese: "请在地图上给我看路线。", keywords: ["show", "map"] },

  { id: "em-restaurant-allergy", category: "restaurant", english: "I have a food allergy.", chinese: "我有食物过敏。", keywords: ["food", "allergy"] },
  { id: "em-restaurant-nuts", category: "restaurant", english: "Does this contain nuts?", chinese: "这个含有坚果吗？", keywords: ["contain", "nuts"] },
  { id: "em-restaurant-wrong-order", category: "restaurant", english: "This is not what I ordered.", chinese: "这不是我点的。", keywords: ["not", "ordered"] },
  { id: "em-restaurant-bill", category: "restaurant", english: "There is a mistake on the bill.", chinese: "账单上有错误。", keywords: ["mistake", "bill"] },
  { id: "em-restaurant-water", category: "restaurant", english: "I need water now.", chinese: "我现在需要水。", keywords: ["water", "now"] },
  { id: "em-restaurant-ingredients", category: "restaurant", english: "Please write the ingredients down.", chinese: "请把配料写下来。", keywords: ["write", "ingredients"] },
  { id: "em-restaurant-sick", category: "restaurant", english: "I feel sick after eating.", chinese: "我吃完后觉得不舒服。", keywords: ["sick", "eating"] },

  { id: "em-shopping-card", category: "shopping", english: "My card payment failed.", chinese: "我的刷卡付款失败了。", keywords: ["card", "failed"] },
  { id: "em-shopping-refund", category: "shopping", english: "I need a refund, please.", chinese: "我需要退款，谢谢。", keywords: ["refund", "need"] },
  { id: "em-shopping-wrong-item", category: "shopping", english: "I received the wrong item.", chinese: "我收到了错误的商品。", keywords: ["wrong", "item"] },
  { id: "em-shopping-receipt", category: "shopping", english: "I need the receipt for tax refund.", chinese: "我需要退税用的收据。", keywords: ["receipt", "tax refund"] },
  { id: "em-shopping-size", category: "shopping", english: "Can I change this size?", chinese: "我可以换这个尺码吗？", keywords: ["change", "size"] },

  { id: "em-medical-doctor", category: "medical", english: "I need to see a doctor.", chinese: "我需要看医生。", keywords: ["doctor", "see"] },
  { id: "em-medical-pharmacy", category: "medical", english: "Where is the nearest pharmacy?", chinese: "最近的药店在哪里？", keywords: ["nearest", "pharmacy"] },
  { id: "em-medical-pain", category: "medical", english: "I have severe pain here.", chinese: "我这里很疼。", keywords: ["pain", "here"] },
  { id: "em-medical-medicine", category: "medical", english: "I need my medicine.", chinese: "我需要我的药。", keywords: ["medicine", "need"] },
  { id: "em-medical-allergic", category: "medical", english: "I am allergic to this medicine.", chinese: "我对这个药过敏。", keywords: ["allergic", "medicine"] },
  { id: "em-medical-hospital", category: "medical", english: "Please call an ambulance.", chinese: "请叫救护车。", keywords: ["ambulance", "call"] },

  { id: "em-help-police", category: "general-help", english: "Where is the police station?", chinese: "警察局在哪里？", keywords: ["police", "station"] },
  { id: "em-help-112", category: "general-help", english: "Please call 112 for help.", chinese: "请拨打112求助。", keywords: ["112", "help"] },
  { id: "em-help-lost", category: "general-help", english: "I am lost. Please help me find this place.", chinese: "我迷路了。请帮我找这个地方。", keywords: ["lost", "place"] },
  { id: "em-help-separated", category: "general-help", english: "I am separated from my family.", chinese: "我和家人走散了。", keywords: ["separated", "family"] },
  { id: "em-help-phone", category: "general-help", english: "My phone and bag are missing.", chinese: "我的手机和包不见了。", keywords: ["phone", "bag"] },
  { id: "em-help-location", category: "general-help", english: "This is my location on the map.", chinese: "这是我在地图上的位置。", keywords: ["location", "map"] }
];
