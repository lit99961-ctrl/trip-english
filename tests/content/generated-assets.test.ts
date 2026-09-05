import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import * as courseCatalog from "../../src/content/catalog";
import { emergencyPhrases } from "../../src/content/emergency-phrases";

const { allMissions } = courseCatalog;

type DictionaryEntry = {
  word: string;
  phonetic: string | null;
  chinese: string;
  tags: string[];
};

const projectRoot = process.cwd();
const dictionaryPath = join(projectRoot, "src/content/dictionary.generated.json");
const pinnedSha = "bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b";

function readText(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function readDictionary(): DictionaryEntry[] {
  const source = readText(dictionaryPath);
  return source === "" ? [] : JSON.parse(source) as DictionaryEntry[];
}

function normalizeEnglishWords(text: string): string[] {
  const normalized = text.normalize("NFKC").replace(/[\u2018\u2019]/gu, "'").toLowerCase();
  return normalized.match(/[\p{L}]+(?:['-][\p{L}]+)*/gu) ?? [];
}

function catalogWords(): string[] {
  const productionEnglish = allMissions.flatMap((mission) =>
    mission.productionPhrases.map((phrase) => phrase.english)
  );
  const businessReading = allMissions
    .filter((mission) => mission.kind === "business")
    .flatMap((mission) => mission.exercises)
    .filter((exercise) => exercise.type === "reading")
    .map((exercise) => exercise.readingText);
  return [...new Set([
    ...productionEnglish,
    ...businessReading,
    ...emergencyPhrases.map((phrase) => phrase.english)
  ].flatMap(normalizeEnglishWords).filter((word) => word.length > 1))].sort();
}

function listAiffFiles(path: string): string[] {
  try {
    return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
      const child = join(path, entry.name);
      return entry.isDirectory() ? listAiffFiles(child) : entry.name.endsWith(".aiff") ? [child] : [];
    });
  } catch {
    return [];
  }
}

describe("generated offline dictionary", () => {
  it("contains exactly one thousand well-formed unique entries", () => {
    const dictionary = readDictionary();
    expect(dictionary).toHaveLength(1000);
    expect(new Set(dictionary.map((entry) => entry.word)).size).toBe(1000);
    for (const entry of dictionary) {
      expect(entry).toEqual({
        word: expect.stringMatching(/^[\p{L}]+(?:['-][\p{L}]+)*$/u),
        phonetic: entry.phonetic === null ? null : expect.any(String),
        chinese: expect.stringMatching(/[\p{Script=Han}]/u),
        tags: expect.any(Array)
      });
      expect(entry.word).toBe(entry.word.normalize("NFKC").toLowerCase());
      expect(entry.chinese.length).toBeLessThanOrEqual(120);
      expect(entry.tags).toEqual([...new Set(entry.tags)].sort());
    }
  });

  it("includes required and every normalized catalog word without sensitive strings", () => {
    const dictionary = readDictionary();
    const words = new Set(dictionary.map((entry) => entry.word));
    for (const required of ["reservation", "platform", "delayed", "deadline", "boarding", ...catalogWords()]) {
      expect(words.has(required), `missing dictionary word: ${required}`).toBe(true);
    }
    expect(JSON.stringify(dictionary)).not.toMatch(/(?:[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\+?\d[\d ()-]{6,}\d)/);
  });

  it("pins ECDICT and records its license and transformation", () => {
    const script = readText(join(projectRoot, "scripts/build-dictionary.mjs"));
    const notice = readText(join(projectRoot, "THIRD_PARTY_NOTICES.md"));
    expect(script).toContain(pinnedSha);
    expect(script).toContain(`https://raw.githubusercontent.com/skywind3000/ECDICT/${pinnedSha}/ecdict.csv`);
    expect(notice).toContain("https://github.com/skywind3000/ECDICT");
    expect(notice).toContain(pinnedSha);
    expect(notice).toMatch(/MIT/i);
    expect(notice).toMatch(/transform/i);
  });

  it("rejects any dictionary source URL other than the exact pinned revision", () => {
    const moduleUrl = pathToFileURL(join(projectRoot, "scripts/build-dictionary.mjs")).href;
    const result = spawnSync(process.execPath, ["--input-type=module", "--eval",
      `import { assertPinnedSourceUrl } from ${JSON.stringify(moduleUrl)}; assertPinnedSourceUrl("https://example.com/ecdict.csv");`
    ], { encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(pinnedSha);
  });
});

describe("fixed audio assets", () => {
  it("exposes a validated manifest and rejects unsafe content IDs", () => {
    const exports = courseCatalog as typeof courseCatalog & {
      fixedAudioPhrases?: readonly { id: string; english: string; audio: string }[];
      contentIdToAudioSlug?: (id: string) => string;
    };
    expect(exports.fixedAudioPhrases).toHaveLength(150);
    expect(exports.fixedAudioPhrases).toEqual([
      ...allMissions.flatMap((mission) => mission.productionPhrases),
      ...emergencyPhrases
    ].map(({ id, english, audio }) => ({ id, english, audio })));
    expect(() => exports.contentIdToAudioSlug?.("../unsafe")).toThrow(/unsafe/i);
    expect(() => exports.contentIdToAudioSlug?.("UPPERCASE")).toThrow(/unsafe/i);
  });

  it("makes the generator reject manifest collisions before writing", () => {
    const moduleUrl = pathToFileURL(join(projectRoot, "scripts/generate-fixed-audio.mjs")).href;
    const result = spawnSync(process.execPath, ["--input-type=module", "--eval", `
      import { validateManifest } from ${JSON.stringify(moduleUrl)};
      const manifest = Array.from({ length: 150 }, (_, index) => {
        const id = index === 149 ? "phrase-0" : \`phrase-\${index}\`;
        return { id, english: "Test phrase", audio: \`/audio/phrases/\${id}.aiff\` };
      });
      validateManifest(manifest);
    `], { encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/collision/i);
  });

  it("uses 150 unique safe IDs and paths backed by nonempty AIFF files", () => {
    const phrases = [
      ...allMissions.flatMap((mission) => mission.productionPhrases),
      ...emergencyPhrases
    ];
    expect(phrases).toHaveLength(150);
    expect(new Set(phrases.map((phrase) => phrase.id)).size).toBe(150);
    const paths = phrases.map((phrase) => phrase.audio);
    expect(new Set(paths).size).toBe(150);
    for (const audioPath of paths) {
      expect(audioPath).toMatch(/^\/audio\/(?:phrases|emergency)\/[a-z0-9]+(?:-[a-z0-9]+)*\.aiff$/);
      const absolutePath = join(projectRoot, "public", audioPath!.slice(1));
      expect(statSync(absolutePath).size, audioPath).toBeGreaterThan(12);
      expect(readFileSync(absolutePath).subarray(0, 4).toString("ascii"), audioPath).toBe("FORM");
    }
  });

  it("has no orphan AIFF files", () => {
    const referenced = [...allMissions.flatMap((mission) => mission.productionPhrases), ...emergencyPhrases]
      .flatMap((phrase) => typeof phrase.audio === "string"
        ? [join(projectRoot, "public", phrase.audio.slice(1))]
        : [])
      .sort();
    expect(listAiffFiles(join(projectRoot, "public/audio")).sort()).toEqual(referenced);
  });
});
