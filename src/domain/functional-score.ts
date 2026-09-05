export interface FunctionalScoreRules {
  requiredKeywords: readonly (readonly string[])[];
}

export interface FunctionalScore {
  passed: boolean;
  matchedGroups: string[][];
  missingGroups: string[][];
  normalizedTranscript: string;
}

const contractions: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bi'm\b/gu, "i am"],
  [/\bi'd\b/gu, "i would"],
  [/\bi'll\b/gu, "i will"],
  [/\bi've\b/gu, "i have"],
  [/\bdon't\b/gu, "do not"],
  [/\bcan't\b/gu, "cannot"],
  [/\bcouldn't\b/gu, "could not"],
  [/\bwon't\b/gu, "will not"]
];

/** Normalizes text for intent matching; it intentionally does not assess pronunciation. */
export function normalizeTranscript(value: string): string {
  let normalized = value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/[‘’]/gu, "'");

  for (const [pattern, replacement] of contractions) {
    normalized = normalized.replace(pattern, replacement);
  }

  return normalized
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/'/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function containsPhrase(transcript: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(?:^|\\s)${escaped}(?=$|\\s)`, "u").test(transcript);
}

/**
 * Scores whether a learner expressed every required intent group. A group is
 * satisfied by any one of its alternatives; invalid empty groups never pass.
 */
export function scoreTranscript(transcript: string, rules: FunctionalScoreRules): FunctionalScore {
  const normalizedTranscript = normalizeTranscript(transcript);
  const groups = rules.requiredKeywords.map((group) => [...group]);
  const matchedGroups: string[][] = [];
  const missingGroups: string[][] = [];

  for (const group of groups) {
    const usableAlternatives = group
      .map((alternative) => normalizeTranscript(alternative))
      .filter((alternative) => alternative.length > 0);
    const matched = usableAlternatives.some((alternative) => containsPhrase(normalizedTranscript, alternative));

    if (matched && usableAlternatives.length > 0) {
      matchedGroups.push(group);
    } else {
      missingGroups.push(group);
    }
  }

  return {
    passed: groups.length > 0 && missingGroups.length === 0,
    matchedGroups,
    missingGroups,
    normalizedTranscript
  };
}
