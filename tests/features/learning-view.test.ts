import { describe, expect, it, vi } from "vitest";
import { travelMissions } from "../../src/content/missions.travel";
import { createLearnerProgressV1 } from "../../src/domain/progress";
import { renderLearning } from "../../src/features/learning/learning-view";

const hotel = travelMissions.find((mission) => mission.id === "hotel-checkin")!;

describe("first-time mission learning", () => {
  it("teaches meaning, chunks and usage before advancing", async () => {
    const progress = createLearnerProgressV1();
    const advanceMissionIntroduction = vi.fn(async () => progress);
    const speak = vi.fn(async (_text: string, _rate: 0.75 | 1) => undefined);
    const view = renderLearning({
      mission: hotel, progress, repository: { advanceMissionIntroduction },
      speech: { speak, startRecording: vi.fn() }, onComplete: vi.fn()
    });
    const sentence = hotel.learningSentences![0]!;
    expect(view.textContent).toContain("1 / 16");
    expect(view.textContent).toContain(sentence.chinese);
    expect(view.textContent).toContain(sentence.english);
    expect(view.textContent).toContain(sentence.usageZh);
    expect(view.textContent).toContain(sentence.chunks[0]);
    expect(view.querySelectorAll("button.primary-action")).toHaveLength(1);
    const buttons = [...view.querySelectorAll<HTMLButtonElement>("button")];
    buttons.find((button) => button.textContent === "正常播放")!.click();
    buttons.find((button) => button.textContent === "慢速播放")!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(speak).toHaveBeenNthCalledWith(1, sentence.english, 1);
    expect(speak).toHaveBeenNthCalledWith(2, sentence.english, 0.75);
    view.querySelector<HTMLButtonElement>("button.primary-action")!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(advanceMissionIntroduction).toHaveBeenCalledWith(expect.objectContaining({
      kind: "sentence", expectedIndex: 0, sentenceId: sentence.id
    }));
  });

  it("shows non-scored recaps and the final say/hear phrase map", () => {
    const progress = createLearnerProgressV1();
    const sentences = hotel.learningSentences!;
    progress.missionIntroductions = { [hotel.id]: {
      missionId: hotel.id, nextSentenceIndex: 5,
      viewedSentenceIds: sentences.slice(0, 5).map((item) => item.id),
      shadowedSentenceIds: [], completedRecapIndexes: []
    } };
    const recap = renderLearning({
      mission: hotel, progress, repository: { advanceMissionIntroduction: vi.fn() },
      speech: { speak: vi.fn(), startRecording: vi.fn() }, onComplete: vi.fn()
    });
    expect(recap.textContent).toContain("轻松回顾");
    expect(recap.textContent).not.toContain("得分");
    expect(recap.textContent).not.toContain(sentences[0]!.english);
    recap.querySelector<HTMLButtonElement>("[data-reveal-recap]")!.click();
    expect(recap.textContent).toContain(sentences[0]!.english);

    progress.missionIntroductions[hotel.id] = {
      missionId: hotel.id, nextSentenceIndex: sentences.length,
      viewedSentenceIds: sentences.map((item) => item.id), shadowedSentenceIds: [],
      completedRecapIndexes: [5, 10, 15]
    };
    const map = renderLearning({
      mission: hotel, progress, repository: { advanceMissionIntroduction: vi.fn() },
      speech: { speak: vi.fn(), startRecording: vi.fn() }, onComplete: vi.fn()
    });
    expect(map.textContent).toContain("我可能要说");
    expect(map.textContent).toContain("我可能听到");
  });

  it("keeps the same sentence and exact payload when saving must be retried", async () => {
    const progress = createLearnerProgressV1();
    const saved = structuredClone(progress);
    saved.missionIntroductions = { [hotel.id]: {
      missionId: hotel.id,
      nextSentenceIndex: 1,
      viewedSentenceIds: [hotel.learningSentences![0]!.id],
      shadowedSentenceIds: [],
      completedRecapIndexes: []
    } };
    const advanceMissionIntroduction = vi.fn()
      .mockRejectedValueOnce(new Error("disk full"))
      .mockResolvedValueOnce(saved);
    const view = renderLearning({
      mission: hotel, progress, repository: { advanceMissionIntroduction },
      speech: { speak: vi.fn(), startRecording: vi.fn() }, onComplete: vi.fn()
    });
    const sentence = hotel.learningSentences![0]!;

    view.querySelector<HTMLButtonElement>("button.primary-action")!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(view.textContent).toContain(sentence.english);
    expect(view.textContent).toContain("重试保存");
    view.querySelector<HTMLButtonElement>("button.primary-action")!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(advanceMissionIntroduction).toHaveBeenCalledTimes(2);
    expect(advanceMissionIntroduction.mock.calls[1]![0]).toEqual(advanceMissionIntroduction.mock.calls[0]![0]);
    expect(view.textContent).toContain(hotel.learningSentences![1]!.english);
  });

  it("offers recording only for learner speech and clears listen-back after advancing", async () => {
    const progress = createLearnerProgressV1();
    const sentences = hotel.learningSentences!;
    progress.missionIntroductions = { [hotel.id]: {
      missionId: hotel.id, nextSentenceIndex: 7,
      viewedSentenceIds: sentences.slice(0, 7).map((sentence) => sentence.id),
      shadowedSentenceIds: [], completedRecapIndexes: [5]
    } };
    const next = structuredClone(progress);
    next.missionIntroductions = { [hotel.id]: {
      missionId: hotel.id, nextSentenceIndex: 8,
      viewedSentenceIds: sentences.slice(0, 8).map((sentence) => sentence.id),
      shadowedSentenceIds: [sentences[7]!.id], completedRecapIndexes: [5]
    } };
    const stop = vi.fn(async () => new Blob(["voice"]));
    const revokeObjectURL = vi.fn();
    const view = renderLearning({
      mission: hotel, progress,
      repository: { advanceMissionIntroduction: vi.fn(async () => next) },
      speech: { speak: vi.fn(), startRecording: vi.fn(async () => ({ stop })) },
      onComplete: vi.fn(), createObjectURL: () => "blob:voice", revokeObjectURL
    });
    expect(view.textContent).toContain("录音跟读");
    view.querySelector<HTMLButtonElement>("[data-learning-record]")!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(view.textContent).toContain("停止并回听");
    [...view.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "停止并回听")!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(view.querySelector("audio")?.getAttribute("src")).toBe("blob:voice");
    view.querySelector<HTMLButtonElement>("button.primary-action")!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:voice");
    expect(view.querySelector("audio")).toBeNull();
    expect(view.textContent).not.toContain("录音跟读");
  });

  it("keeps English selectable and offers a way back", () => {
    const view = renderLearning({
      mission: hotel, progress: createLearnerProgressV1(),
      repository: { advanceMissionIntroduction: vi.fn() },
      speech: { speak: vi.fn(), startRecording: vi.fn() }, onComplete: vi.fn()
    });
    expect(view.querySelector(".learning-english")?.classList).toContain("selectable-english");
    expect(view.querySelector<HTMLAnchorElement>("a[data-learning-back]")?.getAttribute("href")).toBe("#/home");
  });
});
