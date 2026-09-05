import { z } from "zod";
import { missionSchema, type Mission } from "../domain/content-schema";
import { deepFreeze, type DeepReadonly } from "./content-validation";

type PhraseDraft = readonly [string, string, string, string, readonly string[], readonly (readonly string[])[], boolean?];
type ReadingQuestionDraft = Readonly<{ id: string; promptZh: string; expectedAnswers: readonly string[] }>;

function businessMission(
  id: string,
  titleZh: string,
  embeddedSession: 4 | 8 | 11,
  recognitionWords: readonly string[],
  readingText: string,
  questions: readonly ReadingQuestionDraft[],
  activeSuffixes: readonly string[],
  phrases: readonly PhraseDraft[]
): Mission {
  return {
    id,
    kind: "business",
    titleZh,
    city: "Reading practice",
    embeddedSession,
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
    exercises: buildBusinessExercises(id, readingText, questions, activeSuffixes)
  };
}

function buildBusinessExercises(
  id: string,
  readingText: string,
  questions: readonly ReadingQuestionDraft[],
  activeSuffixes: readonly string[]
): Mission["exercises"] {
  const exercises: Mission["exercises"] = [{
    id: `${id}-reading`,
    type: "reading",
    promptZh: "阅读材料并回答问题。",
    readingText,
    questions: questions.map((question) => ({ promptZh: question.promptZh, expectedAnswers: [...question.expectedAnswers] }))
  }];
  if (activeSuffixes[0] !== undefined) exercises.push({ id: `${id}-personal-0`, type: "shadow", phraseId: `${id}-${activeSuffixes[0]}`, promptZh: "跟读自我介绍。" });
  if (activeSuffixes[1] !== undefined) exercises.push({ id: `${id}-personal-1`, type: "recall", phraseId: `${id}-${activeSuffixes[1]}`, promptZh: "不看提示，说出自我介绍。" });
  return exercises;
}

const businessMissionSource: readonly Mission[] = [
  businessMission("email-action", "邮件：找到行动项", 4, ["sender", "subject", "deadline", "attachment"], "FROM: Alex\nTO: You\nSUBJECT: File for Friday\nHello. Please send the file by Friday.\nThank you.", [{ id: "sender", promptZh: "发件人是谁？", expectedAnswers: ["Alex"] }, { id: "recipient", promptZh: "谁需要发送文件？", expectedAnswers: ["You"] }, { id: "action", promptZh: "要做什么？", expectedAnswers: ["send the file"] }, { id: "deadline", promptZh: "截止日是什么时候？", expectedAnswers: ["Friday"] }, { id: "subject", promptZh: "主题是什么？", expectedAnswers: ["File"] }], ["work", "travel"], [
    ["send", "Please send the file by Friday.", "请在周五前发送文件。", "request-action", ["send", "Friday"], [["send"], ["file"], ["Friday"]]],
    ["reply", "I will send it today.", "我今天会发送它。", "confirm-action", ["send", "today"], [["send"], ["today"]]],
    ["topic", "The email is about the file.", "这封邮件是关于文件的。", "identify-topic", ["email", "file"], [["email"], ["file"]]],
    ["deadline", "The deadline is Friday.", "截止日期是周五。", "identify-deadline", ["deadline", "Friday"], [["deadline"], ["Friday"]]],
    ["sender", "The sender needs an answer.", "发件人需要答复。", "identify-sender-need", ["sender", "answer"], [["sender"], ["answer", "reply"]]],
    ["repeat", "Could you send that again?", "您能再发一次吗？", "recover-message", ["send", "again"], [["send"], ["again", "repeat"]], true],
    ["work", "I work in the internet industry.", "我在互联网行业工作。", "self-introduction-work", ["internet", "industry"], [["work"], ["internet industry", "tech industry"]]],
    ["travel", "I am traveling in Italy and Switzerland.", "我正在意大利和瑞士旅行。", "self-introduction-travel", ["Italy", "Switzerland"], [["travel", "traveling"], ["Italy"], ["Switzerland"]]]
  ]),
  businessMission("internet-headline", "互联网标题：识别变化", 8, ["launch", "update", "problem", "service"], "HEADLINE: Bright App has an update today\nSUMMARY: Bright App adds a new map.\nThis is an update, not a problem.", [{ id: "company", promptZh: "哪个公司？", expectedAnswers: ["Bright App"] }, { id: "product", promptZh: "什么产品？", expectedAnswers: ["App"] }, { id: "addition", promptZh: "增加了什么？", expectedAnswers: ["new map"] }, { id: "change-type", promptZh: "这是更新还是问题？", expectedAnswers: ["update"] }, { id: "date", promptZh: "什么时候？", expectedAnswers: ["today"] }], [], [
    ["launch", "The app will launch today.", "这个应用今天将上线。", "identify-launch", ["launch", "today"], [["launch"], ["today"]]],
    ["update", "The service has an update.", "这个服务有更新。", "identify-update", ["service", "update"], [["service"], ["update"]]],
    ["problem", "There is a problem with the app.", "这个应用有问题。", "identify-problem", ["problem", "app"], [["problem"], ["app"]]],
    ["who", "Who made this change?", "谁做了这个改动？", "identify-actor", ["who", "change"], [["who"], ["change", "changed"]]],
    ["what", "What changed today?", "今天有什么变化？", "identify-change", ["what", "changed"], [["change", "changed"], ["today"]]],
    ["simple", "Please use simple words.", "请用简单的词。", "recover-language", ["simple", "words"], [["simple"], ["words", "language"]], true]
  ]),
  businessMission("message-intent", "消息意图：简短回复", 11, ["request", "information", "decision", "urgent"], "Mia: Could you check the plan today?\nLeo: Yes, I can check it.\nMia: I cannot join the meeting at 3.\nLeo: The meeting schedule changes to 4.\nMia: Next step: send the new time.", [{ id: "request", promptZh: "请求是什么？", expectedAnswers: ["check the plan"] }, { id: "confirmer", promptZh: "谁确认？", expectedAnswers: ["Leo"] }, { id: "unavailable-person", promptZh: "谁不能参加？", expectedAnswers: ["Mia"] }, { id: "new-time", promptZh: "会议改到几点？", expectedAnswers: ["4"] }, { id: "next-step", promptZh: "下一步是什么？", expectedAnswers: ["send the new time"] }], [], [
    ["request", "Could you check this today?", "你今天能查看这个吗？", "identify-request", ["could", "today"], [["check"], ["today"]]],
    ["reply", "Yes, I can check it today.", "可以，我今天能查看。", "short-reply", ["yes", "today"], [["yes"], ["today"]]],
    ["info", "This is for your information.", "这是供你参考的信息。", "identify-information", ["information", "for you"], [["information", "info"]]],
    ["decision", "We decided to use the new plan.", "我们决定使用新方案。", "identify-decision", ["decided", "plan"], [["decided", "decision"], ["plan"]]],
    ["urgent", "This is urgent.", "这件事很紧急。", "identify-urgency", ["urgent", "now"], [["urgent"]]],
    ["clarify", "Could you tell me the next step?", "你能告诉我下一步吗？", "recover-next-step", ["next", "step"], [["next step"]], true]
  ])
];

export const businessMissions: DeepReadonly<readonly Mission[]> = deepFreeze(
  z.array(missionSchema).parse(businessMissionSource)
);
