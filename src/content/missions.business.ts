import type { Mission } from "../domain/content-schema";

type PhraseDraft = readonly [string, string, string, string, readonly string[], readonly (readonly string[])[], boolean?];

function businessMission(
  id: string,
  titleZh: string,
  embeddedSession: 4 | 8 | 11,
  recognitionWords: readonly string[],
  readingText: string,
  questions: readonly { readonly promptZh: string; readonly expectedAnswers: readonly string[] }[],
  activeIndexes: readonly number[],
  phrases: readonly PhraseDraft[]
): Mission {
  return {
    id,
    kind: "business",
    titleZh,
    city: "Reading practice",
    embeddedSession,
    recognitionWords: [...recognitionWords],
    productionPhrases: phrases.map(([suffix, english, chinese, intent, keywords, requiredKeywordGroups, recovery], index) => ({
      id: `${id}-${suffix}`,
      english,
      chinese,
      intent,
      keywords: [...keywords],
      requiredKeywordGroups: requiredKeywordGroups.map((group) => [...group]),
      recovery: recovery ?? false,
      activeTarget: activeIndexes.includes(index)
    })),
    exercises: buildBusinessExercises(id, phrases, readingText, questions, activeIndexes)
  };
}

function buildBusinessExercises(
  id: string,
  phrases: readonly PhraseDraft[],
  readingText: string,
  questions: readonly { readonly promptZh: string; readonly expectedAnswers: readonly string[] }[],
  activeIndexes: readonly number[]
): Mission["exercises"] {
  const exercises: Mission["exercises"] = questions.map((question, index) => ({
    id: `${id}-${["reading-main", "intent", "shadow", "recall", "roleplay"][index]!}`,
    type: "reading",
    phraseId: `${id}-${phrases[index]![0]}`,
    promptZh: question.promptZh,
    readingText,
    questions: [{ promptZh: question.promptZh, expectedAnswers: [...question.expectedAnswers] }]
  }));
  if (activeIndexes[0] !== undefined) exercises.push({ id: `${id}-personal-0`, type: "shadow", phraseId: `${id}-${phrases[activeIndexes[0]]![0]}`, promptZh: "跟读自我介绍。" });
  if (activeIndexes[1] !== undefined) exercises.push({ id: `${id}-personal-1`, type: "recall", phraseId: `${id}-${phrases[activeIndexes[1]]![0]}`, promptZh: "不看提示，说出自我介绍。" });
  return exercises;
}

export const businessMissions: readonly Mission[] = [
  businessMission("email-action", "邮件：找到行动项", 4, ["sender", "subject", "deadline", "attachment"], "FROM: Alex\nTO: You\nSUBJECT: File for Friday\nHello. Please send the file by Friday.\nThank you.", [{ promptZh: "发件人是谁？", expectedAnswers: ["Alex"] }, { promptZh: "谁需要发送文件？", expectedAnswers: ["You"] }, { promptZh: "要做什么？", expectedAnswers: ["send the file"] }, { promptZh: "截止日是什么时候？", expectedAnswers: ["Friday"] }, { promptZh: "主题是什么？", expectedAnswers: ["File"] }], [6, 7], [
    ["send", "Please send the file by Friday.", "请在周五前发送文件。", "request-action", ["send", "Friday"], [["send"], ["file"], ["Friday"]]],
    ["reply", "I will send it today.", "我今天会发送它。", "confirm-action", ["send", "today"], [["send"], ["today"]]],
    ["topic", "The email is about the file.", "这封邮件是关于文件的。", "identify-topic", ["email", "file"], [["email"], ["file"]]],
    ["deadline", "The deadline is Friday.", "截止日期是周五。", "identify-deadline", ["deadline", "Friday"], [["deadline"], ["Friday"]]],
    ["sender", "The sender needs an answer.", "发件人需要答复。", "identify-sender-need", ["sender", "answer"], [["sender"], ["answer", "reply"]]],
    ["repeat", "Could you send that again?", "您能再发一次吗？", "recover-message", ["send", "again"], [["send"], ["again", "repeat"]], true],
    ["work", "I work in the internet industry.", "我在互联网行业工作。", "self-introduction-work", ["internet", "industry"], [["internet industry", "tech industry"]]],
    ["travel", "I am traveling in Italy and Switzerland.", "我正在意大利和瑞士旅行。", "self-introduction-travel", ["Italy", "Switzerland"], [["Italy"], ["Switzerland"]]]
  ]),
  businessMission("internet-headline", "互联网标题：识别变化", 8, ["launch", "update", "problem", "service"], "HEADLINE: Bright App has an update today\nSUMMARY: Bright App adds a new map.\nThis is an update, not a problem.", [{ promptZh: "哪个公司？", expectedAnswers: ["Bright App"] }, { promptZh: "什么产品？", expectedAnswers: ["App"] }, { promptZh: "增加了什么？", expectedAnswers: ["new map"] }, { promptZh: "这是更新还是问题？", expectedAnswers: ["update"] }, { promptZh: "什么时候？", expectedAnswers: ["today"] }], [], [
    ["launch", "The app will launch today.", "这个应用今天将上线。", "identify-launch", ["launch", "today"], [["launch"], ["today"]]],
    ["update", "The service has an update.", "这个服务有更新。", "identify-update", ["service", "update"], [["service"], ["update"]]],
    ["problem", "There is a problem with the app.", "这个应用有问题。", "identify-problem", ["problem", "app"], [["problem"], ["app"]]],
    ["who", "Who made this change?", "谁做了这个改动？", "identify-actor", ["who", "change"], [["who"], ["change", "changed"]]],
    ["what", "What changed today?", "今天有什么变化？", "identify-change", ["what", "changed"], [["change", "changed"], ["today"]]],
    ["simple", "Please use simple words.", "请用简单的词。", "recover-language", ["simple", "words"], [["simple"], ["words", "language"]], true]
  ]),
  businessMission("message-intent", "消息意图：简短回复", 11, ["request", "information", "decision", "urgent"], "Mia: Could you check the plan today?\nLeo: Yes, I can check it.\nMia: I cannot join the meeting at 3.\nLeo: The meeting schedule changes to 4.\nMia: Next step: send the new time.", [{ promptZh: "请求是什么？", expectedAnswers: ["check the plan"] }, { promptZh: "谁确认？", expectedAnswers: ["Leo"] }, { promptZh: "谁不能参加？", expectedAnswers: ["Mia"] }, { promptZh: "会议改到几点？", expectedAnswers: ["4"] }, { promptZh: "下一步是什么？", expectedAnswers: ["send the new time"] }], [], [
    ["request", "Could you check this today?", "你今天能查看这个吗？", "identify-request", ["could", "today"], [["check"], ["today"]]],
    ["reply", "Yes, I can check it today.", "可以，我今天能查看。", "short-reply", ["yes", "today"], [["yes"], ["today"]]],
    ["info", "This is for your information.", "这是供你参考的信息。", "identify-information", ["information", "for you"], [["information", "info"]]],
    ["decision", "We decided to use the new plan.", "我们决定使用新方案。", "identify-decision", ["decided", "plan"], [["decided", "decision"], ["plan"]]],
    ["urgent", "This is urgent.", "这件事很紧急。", "identify-urgency", ["urgent", "now"], [["urgent"]]],
    ["clarify", "Could you tell me the next step?", "你能告诉我下一步吗？", "recover-next-step", ["next", "step"], [["next step"]], true]
  ])
];
