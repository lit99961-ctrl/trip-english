import { existsSync, readFileSync, readdirSync } from "node:fs";
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
  return normalized.match(/(?<![\p{L}\p{N}])[\p{L}]+(?:['-][\p{L}]+)*(?![\p{L}\p{N}])/gu) ?? [];
}

function displayedEnglishWords(): string[] {
  const displayedText: string[] = [];
  for (const mission of allMissions) {
    displayedText.push(mission.city, ...mission.recognitionWords);
    displayedText.push(...mission.productionPhrases.map((phrase) => phrase.english));
    for (const exercise of mission.exercises) {
      if (exercise.type === "reading") {
        displayedText.push(exercise.readingText);
        displayedText.push(...exercise.questions.flatMap((question) => question.expectedAnswers));
      }
      if (exercise.type === "roleplay") {
        displayedText.push(courseCatalog.renderRoleplayPrompt(exercise.promptTemplate, exercise.variation));
        displayedText.push(...Object.values(exercise.variation));
      }
    }
  }
  displayedText.push(...emergencyPhrases.map((phrase) => phrase.english));
  return [...new Set(displayedText.flatMap(normalizeEnglishWords))].sort();
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
    for (const required of ["reservation", "platform", "delayed", "deadline", "boarding", ...displayedEnglishWords()]) {
      expect(words.has(required), `missing dictionary word: ${required}`).toBe(true);
    }
    expect(JSON.stringify(dictionary)).not.toMatch(/(?:[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\+?\d[\d ()-]{6,}\d)/);
  });

  it("uses audited course-context meanings for displayed proper names", () => {
    const dictionary = new Map(readDictionary().map((entry) => [entry.word, entry]));
    const properNames = {
      alex: "亚历克斯（人名）",
      bright: "Bright App（示例应用名）",
      florence: "佛罗伦萨（意大利城市）",
      gornergrat: "戈尔内格拉特（瑞士山地）",
      grindelwald: "格林德瓦（瑞士地名）",
      helsinki: "赫尔辛基（芬兰城市）",
      hong: "香港（Hong Kong 地名组成）",
      interlaken: "因特拉肯（瑞士城市）",
      italy: "意大利（国家）",
      kong: "香港（Hong Kong 地名组成）",
      leo: "利奥（人名）",
      leonardo: "莱昂纳多特快列车（机场列车）",
      li: "李（姓氏）",
      lucerne: "卢塞恩（瑞士城市）",
      lungern: "伦根（瑞士城镇）",
      mia: "米娅（人名）",
      milan: "米兰（意大利城市）",
      rialto: "里亚托（威尼斯地名/里亚托桥）",
      rome: "罗马（意大利城市）",
      switzerland: "瑞士（国家）",
      termini: "罗马特米尼火车站",
      vatican: "梵蒂冈（梵蒂冈博物馆）",
      venice: "威尼斯（意大利城市）",
      zermatt: "采尔马特（瑞士城镇）",
      zurich: "苏黎世（瑞士城市）"
    } as const;

    for (const [word, chinese] of Object.entries(properNames)) {
      expect(dictionary.get(word)?.chinese, word).toBe(chinese);
      expect(dictionary.get(word)?.tags, word).toEqual(expect.arrayContaining([
        "catalog", "context", "manual", "proper-name"
      ]));
    }
    for (const word of ["leo", "lucerne", "rialto", "rome", "termini", "zurich"]) {
      expect(dictionary.get(word)?.phonetic, `${word} should retain ECDICT phonetic`).toEqual(expect.any(String));
    }
    // Rome Termini uses the Italian station-name pronunciation, not ECDICT's
    // inherited English pronunciation of the Latin-derived plural /ˈtɜːmɪnaɪ/.
    expect(dictionary.get("termini")?.phonetic).toBe("/ˈtɛr.mi.ni/");
  });

  it("keeps visible single-letter words and labels as lowercase contextual entries", () => {
    const dictionary = new Map(readDictionary().map((entry) => [entry.word, entry]));
    expect(dictionary.get("i")).toMatchObject({ word: "i", chinese: "我" });
    expect(dictionary.get("a")).toMatchObject({ word: "a", chinese: "一个；一（不定冠词）" });
    expect(dictionary.get("b")).toMatchObject({ word: "b", chinese: "B（区域、入口或站台等位置标签）" });
    for (const word of ["i", "a", "b"]) {
      expect(dictionary.get(word)?.tags, word).toEqual(expect.arrayContaining(["catalog", "context", "manual"]));
    }

    const moduleUrl = pathToFileURL(join(projectRoot, "scripts/build-dictionary.mjs")).href;
    const result = spawnSync(process.execPath, ["--input-type=module", "--eval", `
      import { normalizeEnglishWords } from ${JSON.stringify(moduleUrl)};
      const actual = normalizeEnglishWords("I need a ticket at entrance B, seat 12A.");
      const expected = ["i", "need", "a", "ticket", "at", "entrance", "b", "seat"];
      if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(JSON.stringify(actual));
    `], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
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
    expect(notice).toContain("Copyright (c) 2025 Linwei");
    expect(notice).toContain("Permission is hereby granted, free of charge, to any person obtaining a copy");
    expect(notice).toContain("The above copyright notice and this permission notice shall be included in all");
    expect(notice).toContain("THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR");
    expect(notice).toContain("OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.");
  });

  it("rejects any dictionary source URL other than the exact pinned revision", () => {
    const moduleUrl = pathToFileURL(join(projectRoot, "scripts/build-dictionary.mjs")).href;
    const result = spawnSync(process.execPath, ["--input-type=module", "--eval",
      `import { assertPinnedSourceUrl } from ${JSON.stringify(moduleUrl)}; assertPinnedSourceUrl("https://example.com/ecdict.csv");`
    ], { encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(pinnedSha);
  });

  it("times out stalled ECDICT downloads with a clear error", () => {
    const moduleUrl = pathToFileURL(join(projectRoot, "scripts/build-dictionary.mjs")).href;
    const result = spawnSync(process.execPath, ["--input-type=module", "--eval", `
      import { readEcdict } from ${JSON.stringify(moduleUrl)};
      const stalledFetch = async (_url, { signal }) => {
        let streamController;
        const body = new ReadableStream({ start(controller) { streamController = controller; } });
        signal.addEventListener("abort", () => streamController.error(Object.assign(new Error("body aborted"), { name: "AbortError" })));
        return { ok: true, status: 200, statusText: "OK", body };
      };
      try { await readEcdict(new Set(), { fetchImpl: stalledFetch, timeoutMs: 5 }); }
      catch (error) { if (/timed out.*5 ms/i.test(String(error))) process.exit(0); throw error; }
      throw new Error("stalled download did not time out");
    `], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  });

  it("propagates ECDICT response stream errors", () => {
    const moduleUrl = pathToFileURL(join(projectRoot, "scripts/build-dictionary.mjs")).href;
    const result = spawnSync(process.execPath, ["--input-type=module", "--eval", `
      import { readEcdict } from ${JSON.stringify(moduleUrl)};
      const brokenFetch = async () => ({
        ok: true, status: 200, statusText: "OK",
        body: new ReadableStream({ start(controller) { controller.error(new Error("stream boom")); } })
      });
      try { await readEcdict(new Set(), { fetchImpl: brokenFetch, timeoutMs: 1000 }); }
      catch (error) { if (String(error).includes("stream boom")) process.exit(0); throw error; }
      throw new Error("broken response stream was accepted");
    `], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  });

  it("preserves an existing dictionary when atomic serialization fails", () => {
    const moduleUrl = pathToFileURL(join(projectRoot, "scripts/build-dictionary.mjs")).href;
    const result = spawnSync(process.execPath, ["--input-type=module", "--eval", `
      import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
      import { tmpdir } from "node:os";
      import { join } from "node:path";
      import { writeStableJson } from ${JSON.stringify(moduleUrl)};
      const directory = await mkdtemp(join(tmpdir(), "dictionary-atomic-"));
      const target = join(directory, "dictionary.json");
      await writeFile(target, "old dictionary\\n");
      try { await writeStableJson([{ unsupported: 1n }], target); } catch {}
      const after = await readFile(target, "utf8");
      await rm(directory, { recursive: true });
      if (after !== "old dictionary\\n") throw new Error("existing dictionary was changed");
    `], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  });

  it("selects the same ranked dictionary regardless of source insertion order", () => {
    const moduleUrl = pathToFileURL(join(projectRoot, "scripts/build-dictionary.mjs")).href;
    const result = spawnSync(process.execPath, ["--input-type=module", "--eval", `
      import { selectEntries } from ${JSON.stringify(moduleUrl)};
      const catalog = new Map([["catalog", { word: "catalog", phonetic: null, chinese: "目录", tags: ["catalog"], bnc: Infinity, frq: Infinity }]]);
      const fillers = Array.from({ length: 999 }, (_, index) => ({
        word: \`word-\${String(index).padStart(3, "0")}\`, phonetic: null, chinese: "词", tags: ["ecdict"],
        bnc: index % 7 + 1, frq: index % 11 + 1
      }));
      const first = selectEntries(new Set(["catalog"]), new Map(catalog), new Map(fillers.map((entry) => [entry.word, entry])));
      const second = selectEntries(new Set(["catalog"]), new Map(catalog), new Map([...fillers].reverse().map((entry) => [entry.word, entry])));
      if (first.length !== 1000 || JSON.stringify(first) !== JSON.stringify(second)) throw new Error("selection is not stable");
    `], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  });
});

describe("open-source media boundary", () => {
  it("contains no generated system-voice files or generator", () => {
    const phrases = [
      ...allMissions.flatMap((mission) => mission.productionPhrases),
      ...emergencyPhrases
    ];
    expect(phrases).toHaveLength(150);
    expect(new Set(phrases.map((phrase) => phrase.id)).size).toBe(150);
    expect(phrases.every((phrase) => !("audio" in phrase))).toBe(true);
    expect(listAiffFiles(join(projectRoot, "public"))).toEqual([]);
    expect(existsSync(join(projectRoot, "scripts/generate-fixed-audio.mjs"))).toBe(false);
  });
});
