import type { Mission } from "../domain/content-schema";

type PhraseDraft = readonly [string, string, string, string, readonly string[], boolean?];

function businessMission(
  id: string,
  titleZh: string,
  embeddedSession: 4 | 8 | 11,
  recognitionWords: readonly string[],
  variation: Record<string, string>,
  readingText: string,
  phrases: readonly PhraseDraft[]
): Mission {
  return {
    id,
    kind: "business",
    titleZh,
    city: "Reading practice",
    embeddedSession,
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
      { id: `${id}-reading-main`, type: "reading", phraseId: `${id}-${phrases[0]![0]}`, promptZh: "读短文本，找出谁、什么事和下一步。", readingText },
      { id: `${id}-intent`, type: "intent", phraseId: `${id}-${phrases[1]![0]}`, promptZh: "判断这句话是请求、信息还是决定。" },
      { id: `${id}-shadow`, type: "shadow", phraseId: `${id}-${phrases[1]![0]}`, promptZh: "跟读一个简短回复。" },
      { id: `${id}-recall`, type: "recall", phraseId: `${id}-${phrases[2]![0]}`, promptZh: "不看提示，说出要做的事。" },
      { id: `${id}-roleplay`, type: "roleplay", phraseId: `${id}-${phrases[3]![0]}`, promptZh: "按给定的小变化，回复一条简短消息。", variation }
    ]
  };
}

export const businessMissions: readonly Mission[] = [
  businessMission("email-action", "邮件：找到行动项", 4, ["sender", "subject", "deadline", "attachment"], { deadline: "Friday", item: "file" }, "SUBJECT: FILE NEEDED BY FRIDAY", [
    ["send", "Please send the file by Friday.", "请在周五前发送文件。", "request-action", ["send", "Friday"]],
    ["reply", "I will send it today.", "我今天会发送它。", "confirm-action", ["send", "today"]],
    ["topic", "The email is about the file.", "这封邮件是关于文件的。", "identify-topic", ["email", "file"]],
    ["deadline", "The deadline is Friday.", "截止日期是周五。", "identify-deadline", ["deadline", "Friday"]],
    ["sender", "The sender needs an answer.", "发件人需要答复。", "identify-sender-need", ["sender", "answer"]],
    ["repeat", "Could you send that again?", "您能再发一次吗？", "recover-message", ["send", "again"], true]
  ]),
  businessMission("internet-headline", "互联网标题：识别变化", 8, ["launch", "update", "problem", "service"], { change: "update", service: "app" }, "HEADLINE: APP UPDATE LAUNCHES TODAY", [
    ["launch", "The app will launch today.", "这个应用今天将上线。", "identify-launch", ["launch", "today"]],
    ["update", "The service has an update.", "这个服务有更新。", "identify-update", ["service", "update"]],
    ["problem", "There is a problem with the app.", "这个应用有问题。", "identify-problem", ["problem", "app"]],
    ["who", "Who made this change?", "谁做了这个改动？", "identify-actor", ["who", "change"]],
    ["what", "What changed today?", "今天有什么变化？", "identify-change", ["what", "changed"]],
    ["simple", "Please use simple words.", "请用简单的词。", "recover-language", ["simple", "words"], true]
  ]),
  businessMission("message-intent", "消息意图：简短回复", 11, ["request", "information", "decision", "urgent"], { urgency: "urgent", reply: "today" }, "MESSAGE: PLEASE CHECK THIS TODAY", [
    ["request", "Could you check this today?", "你今天能查看这个吗？", "identify-request", ["could", "today"]],
    ["reply", "Yes, I can check it today.", "可以，我今天能查看。", "short-reply", ["yes", "today"]],
    ["info", "This is for your information.", "这是供你参考的信息。", "identify-information", ["information", "for you"]],
    ["decision", "We decided to use the new plan.", "我们决定使用新方案。", "identify-decision", ["decided", "plan"]],
    ["urgent", "This is urgent.", "这件事很紧急。", "identify-urgency", ["urgent", "now"]],
    ["clarify", "Could you tell me the next step?", "你能告诉我下一步吗？", "recover-next-step", ["next", "step"], true]
  ])
];
