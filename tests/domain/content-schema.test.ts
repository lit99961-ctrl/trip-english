import { describe, expect, it } from "vitest";
import { missionSchema } from "../../src/domain/content-schema";

describe("missionSchema", () => {
  it("requires a recovery phrase and five to eight production phrases", () => {
    const invalid = { id: "hotel", titleZh: "酒店", productionPhrases: [], exercises: [] };

    expect(missionSchema.safeParse(invalid).success).toBe(false);
  });

  it("accepts five to eight phrases only when one is a recovery phrase", () => {
    const mission = {
      id: "hotel",
      kind: "travel",
      titleZh: "酒店",
      city: "Tokyo",
      productionPhrases: Array.from({ length: 5 }, (_, index) => ({
        id: `phrase-${index}`,
        english: `Phrase ${index}`,
        chinese: `短语 ${index}`,
        intent: "request",
        keywords: ["phrase"],
        recovery: false
      })),
      recognitionWords: ["hotel"],
      exercises: Array.from({ length: 5 }, (_, index) => ({
        id: `exercise-${index}`,
        type: "intent",
        promptZh: `练习 ${index}`
      }))
    };

    const withoutRecovery = missionSchema.safeParse(mission);
    expect(withoutRecovery.success).toBe(false);
    if (!withoutRecovery.success) {
      expect(withoutRecovery.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ message: "mission requires a recovery phrase" })
        ])
      );
    }

    mission.productionPhrases[0]!.recovery = true;
    expect(missionSchema.safeParse(mission).success).toBe(true);
    expect(missionSchema.safeParse({
      ...mission,
      productionPhrases: mission.productionPhrases.slice(0, 4)
    }).success).toBe(false);
    expect(missionSchema.safeParse({
      ...mission,
      productionPhrases: [...mission.productionPhrases, { ...mission.productionPhrases[0]!, id: "extra" }, { ...mission.productionPhrases[0]!, id: "extra-2" }, { ...mission.productionPhrases[0]!, id: "extra-3" }, { ...mission.productionPhrases[0]!, id: "extra-4" }]
    }).success).toBe(false);
  });
});
