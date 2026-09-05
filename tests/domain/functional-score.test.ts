import { describe, expect, it } from "vitest";
import { normalizeTranscript, scoreTranscript } from "../../src/domain/functional-score";

describe("scoreTranscript", () => {
  it("passes the functional grammar-tolerant reservation response", () => {
    expect(scoreTranscript("I have reservation Li", {
      requiredKeywords: [["reservation", "booking"], ["li"]]
    }).passed).toBe(true);
  });

  it("matches one alternative from each required group", () => {
    const result = scoreTranscript("My booking is under Li", {
      requiredKeywords: [["reservation", "booking"], ["under li", "li"]]
    });

    expect(result).toMatchObject({
      passed: true,
      matchedGroups: [["reservation", "booking"], ["under li", "li"]],
      missingGroups: []
    });
  });

  it("normalizes punctuation, case, curly contractions, and whitespace safely", () => {
    expect(normalizeTranscript("  I’M—LI.  I’ll  check-in; don’t worry!  "))
      .toBe("i am li i will check in do not worry");
  });

  it.each([
    ["you're", "you are"], ["we're", "we are"], ["they're", "they are"],
    ["he's", "he is"], ["she's", "she is"], ["it's", "it is"],
    ["isn't", "is not"], ["aren't", "are not"], ["wasn't", "was not"],
    ["weren't", "were not"], ["doesn't", "does not"], ["didn't", "did not"],
    ["hasn't", "has not"], ["haven't", "have not"], ["hadn't", "had not"],
    ["wouldn't", "would not"], ["shouldn't", "should not"], ["mustn't", "must not"]
  ])("normalizes the common contraction %s in straight and curly forms", (contraction, expanded) => {
    expect(normalizeTranscript(contraction)).toBe(expanded);
    expect(normalizeTranscript(contraction.replace("'", "’"))).toBe(expanded);
  });

  it("does not mistake an arbitrary possessive for a contraction", () => {
    expect(normalizeTranscript("Li's booking")).toBe("li s booking");
  });

  it("matches multiword phrases only at token boundaries", () => {
    expect(scoreTranscript("Please check in my reservation", {
      requiredKeywords: [["check in"]]
    }).passed).toBe(true);
  });

  it("does not match a keyword as a substring of another word", () => {
    const result = scoreTranscript("I am training today", {
      requiredKeywords: [["train"]]
    });

    expect(result.passed).toBe(false);
    expect(result.missingGroups).toEqual([["train"]]);
  });

  it("does not award success for missing or empty keyword groups", () => {
    expect(scoreTranscript("anything", { requiredKeywords: [] }).passed).toBe(false);
    expect(scoreTranscript("reservation", { requiredKeywords: [[]] })).toMatchObject({
      passed: false,
      matchedGroups: [],
      missingGroups: [[]]
    });
  });
});
