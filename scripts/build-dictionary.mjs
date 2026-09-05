import { createWriteStream } from "node:fs";
import { mkdir, rename, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse";
import { createServer } from "vite";

export const ECDICT_COMMIT = "bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b";
export const ECDICT_SOURCE_URL = "https://raw.githubusercontent.com/skywind3000/ECDICT/bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b/ecdict.csv";
const EXPECTED_COLUMNS = ["word", "phonetic", "definition", "translation", "pos", "collins", "oxford", "tag", "bnc", "frq", "exchange", "detail", "audio"];
const OUTPUT_SIZE = 1000;
const DOWNLOAD_TIMEOUT_MS = 30_000;
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = join(projectRoot, "src/content/dictionary.generated.json");

// Audited proper names use their course-context meaning even when ECDICT has a
// homonymous headword. ECDICT phonetics and source tags are retained when useful.
function properName(chinese, phonetic) {
  return { chinese, ...(phonetic === undefined ? {} : { phonetic }) };
}

const contextProperNameOverrides = new Map(Object.entries({
  "alex": properName("亚历克斯（人名）"),
  "bright": properName("Bright App（示例应用名）"),
  "florence": properName("佛罗伦萨（意大利城市）"),
  "gornergrat": properName("戈尔内格拉特（瑞士山地）"),
  "grindelwald": properName("格林德瓦（瑞士地名）"),
  "helsinki": properName("赫尔辛基（芬兰城市）"),
  "hong": properName("香港（Hong Kong 地名组成）"),
  "interlaken": properName("因特拉肯（瑞士城市）"),
  "italy": properName("意大利（国家）"),
  "kong": properName("香港（Hong Kong 地名组成）"),
  "leo": properName("利奥（人名）"),
  "leonardo": properName("莱昂纳多特快列车（机场列车）"),
  "li": properName("李（姓氏）"),
  "lucerne": properName("卢塞恩（瑞士城市）"),
  "lungern": properName("伦根（瑞士城镇）"),
  "mia": properName("米娅（人名）"),
  "milan": properName("米兰（意大利城市）"),
  "rialto": properName("里亚托（威尼斯地名/里亚托桥）"),
  "rome": properName("罗马（意大利城市）"),
  "switzerland": properName("瑞士（国家）"),
  "termini": properName("罗马特米尼火车站", "/ˈtɛr.mi.ni/"),
  "vatican": properName("梵蒂冈（梵蒂冈博物馆）"),
  "venice": properName("威尼斯（意大利城市）"),
  "zermatt": properName("采尔马特（瑞士城镇）"),
  "zurich": properName("苏黎世（瑞士城市）")
}));

const contextTokenOverrides = new Map(Object.entries({
  "a": { chinese: "一个；一（不定冠词）", phonetic: "/ə; eɪ/", tags: ["article"] },
  "b": { chinese: "B（区域、入口或站台等位置标签）", phonetic: "/biː/", tags: ["label"] },
  "i": { chinese: "我", phonetic: "/aɪ/", tags: ["pronoun"] }
}));

// Catalog variants without a usable pinned ECDICT translation fall back here.
const manualFallbackOverrides = new Map(Object.entries({
  "can't": "不能；无法",
  "don't": "不；不要",
  "vaporetto": "威尼斯水上巴士"
}));

export function assertPinnedSourceUrl(url) {
  if (url !== ECDICT_SOURCE_URL || !url.includes(`/${ECDICT_COMMIT}/`)) {
    throw new Error(`ECDICT source must be pinned to ${ECDICT_COMMIT}`);
  }
}

export function normalizeEnglishWords(text) {
  const normalized = text.normalize("NFKC").replace(/[\u2018\u2019]/gu, "'").toLowerCase();
  return normalized.match(/(?<![\p{L}\p{N}])[\p{L}]+(?:['-][\p{L}]+)*(?![\p{L}\p{N}])/gu) ?? [];
}

function normalizedWord(value) {
  const words = normalizeEnglishWords(String(value ?? "").trim());
  return words.length === 1 && words[0] === String(value ?? "").trim().normalize("NFKC").replace(/[\u2018\u2019]/gu, "'").toLowerCase()
    ? words[0]
    : null;
}

function conciseChinese(value) {
  const segments = String(value ?? "")
    .replace(/\\n/gu, "\n")
    .split(/[\n；;]/u)
    .map((segment) => segment.replace(/\s+/gu, " ").trim())
    .filter(Boolean);
  const useful = segments.find((segment) => /[\p{Script=Han}]/u.test(segment));
  return useful === undefined ? null : [...useful].slice(0, 120).join("");
}

function firstPhonetic(value) {
  const first = String(value ?? "").split(/[\n;,]/u).map((item) => item.trim()).find(Boolean);
  return first ?? null;
}

function positiveRank(value) {
  const number = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(number) && number > 0 ? number : Number.POSITIVE_INFINITY;
}

function tagsFor(row, catalog) {
  const sourceTags = String(row.tag ?? "").split(/\s+/u).map((tag) => tag.trim().toLowerCase()).filter(Boolean);
  return [...new Set([
    "ecdict",
    ...(catalog ? ["catalog"] : []),
    ...(String(row.oxford ?? "").trim() !== "" && String(row.oxford) !== "0" ? ["oxford"] : []),
    ...sourceTags
  ])].sort();
}

async function loadCatalogWords() {
  const server = await createServer({ root: projectRoot, logLevel: "error", server: { middlewareMode: true }, appType: "custom" });
  try {
    const displayedModule = await server.ssrLoadModule("/src/content/displayed-english.ts");
    return new Set(displayedModule.displayedEnglish.flatMap(normalizeEnglishWords));
  } finally {
    await server.close();
  }
}

function assertHeader(columns) {
  const missing = EXPECTED_COLUMNS.filter((column) => !columns.includes(column));
  if (missing.length > 0) throw new Error(`malformed ECDICT header; missing columns: ${missing.join(", ")}`);
}

export async function readEcdict(catalogWords, options = {}) {
  const { fetchImpl = fetch, timeoutMs = DOWNLOAD_TIMEOUT_MS } = options;
  assertPinnedSourceUrl(ECDICT_SOURCE_URL);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error(`invalid ECDICT timeout: ${timeoutMs}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response;
    try {
      response = await fetchImpl(ECDICT_SOURCE_URL, { signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) throw new Error(`ECDICT download timed out after ${timeoutMs} ms`, { cause: error });
      throw new Error(`ECDICT download failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
    if (!response.ok) throw new Error(`ECDICT download failed: HTTP ${response.status} ${response.statusText}`);
    if (response.body === null) throw new Error("ECDICT download failed: response body is empty");

    let checkedHeader = false;
    const catalogEntries = new Map();
    const fillerEntries = new Map();
    const parser = parse({
      bom: true,
      columns(header) {
        const normalized = header.map((column) => column.trim().toLowerCase());
        assertHeader(normalized);
        checkedHeader = true;
        return normalized;
      },
      relax_quotes: true,
      relax_column_count: true,
      skip_empty_lines: true
    });
    let streamError;
    const pumping = pipeline(Readable.fromWeb(response.body), parser).catch((error) => { streamError = error; });
    try {
      for await (const row of parser) {
        const word = normalizedWord(row.word);
        if (word === null) continue;
        const chinese = conciseChinese(row.translation);
        if (chinese === null) continue;
        const isCatalog = catalogWords.has(word);
        const bnc = positiveRank(row.bnc);
        const frq = positiveRank(row.frq);
        const isOxford = String(row.oxford ?? "").trim() !== "" && String(row.oxford) !== "0";
        const entry = { word, phonetic: firstPhonetic(row.phonetic), chinese, tags: tagsFor(row, isCatalog), bnc, frq };
        if (isCatalog && !catalogEntries.has(word)) catalogEntries.set(word, entry);
        if (isOxford && (Number.isFinite(bnc) || Number.isFinite(frq)) && !fillerEntries.has(word)) fillerEntries.set(word, entry);
      }
    } catch (error) {
      streamError ??= error;
    }
    await pumping;
    if (streamError !== undefined) {
      if (controller.signal.aborted) throw new Error(`ECDICT download timed out after ${timeoutMs} ms`, { cause: streamError });
      throw streamError;
    }
    if (!checkedHeader) throw new Error("malformed ECDICT source: no CSV header");
    return { catalogEntries, fillerEntries };
  } finally {
    clearTimeout(timeout);
  }
}

function withoutRanks(entry) {
  return { word: entry.word, phonetic: entry.phonetic, chinese: entry.chinese, tags: entry.tags };
}

export function selectEntries(catalogWords, catalogEntries, fillerEntries) {
  for (const word of [...catalogWords].sort()) {
    const contextualOverride = contextProperNameOverrides.get(word);
    if (contextualOverride !== undefined) {
      const source = catalogEntries.get(word);
      catalogEntries.set(word, {
        word,
        phonetic: contextualOverride.phonetic ?? source?.phonetic ?? null,
        chinese: contextualOverride.chinese,
        tags: [...new Set([...(source?.tags ?? ["catalog"]), "context", "manual", "proper-name"])].sort(),
        bnc: source?.bnc ?? Number.POSITIVE_INFINITY,
        frq: source?.frq ?? Number.POSITIVE_INFINITY
      });
    } else if (contextTokenOverrides.has(word)) {
      const source = catalogEntries.get(word);
      const tokenOverride = contextTokenOverrides.get(word);
      catalogEntries.set(word, {
        word,
        phonetic: tokenOverride.phonetic,
        chinese: tokenOverride.chinese,
        tags: [...new Set([...(source?.tags ?? ["catalog"]), "context", "manual", ...tokenOverride.tags])].sort(),
        bnc: source?.bnc ?? Number.POSITIVE_INFINITY,
        frq: source?.frq ?? Number.POSITIVE_INFINITY
      });
    } else if (!catalogEntries.has(word) && manualFallbackOverrides.has(word)) {
      catalogEntries.set(word, { word, phonetic: null, chinese: manualFallbackOverrides.get(word), tags: ["catalog", "manual", "variant"], bnc: Number.POSITIVE_INFINITY, frq: Number.POSITIVE_INFINITY });
    }
  }
  const missing = [...catalogWords].filter((word) => !catalogEntries.has(word)).sort();
  if (missing.length > 0) throw new Error(`catalog words missing from ECDICT and manual overrides: ${missing.join(", ")}`);

  const catalog = [...catalogEntries.values()].sort((a, b) => a.word.localeCompare(b.word, "en"));
  const selectedWords = new Set(catalog.map((entry) => entry.word));
  const filler = [...fillerEntries.values()]
    .filter((entry) => !selectedWords.has(entry.word))
    .sort((a, b) => a.bnc - b.bnc || a.frq - b.frq || a.word.localeCompare(b.word, "en"));
  const selected = [...catalog, ...filler.slice(0, OUTPUT_SIZE - catalog.length)].map(withoutRanks);
  if (selected.length !== OUTPUT_SIZE) throw new Error(`ECDICT supplied only ${selected.length} eligible unique entries; expected ${OUTPUT_SIZE}`);
  if (new Set(selected.map((entry) => entry.word)).size !== selected.length) throw new Error("duplicate normalized dictionary words");
  return selected;
}

export async function writeStableJson(entries, destination = outputPath) {
  const serialized = `${JSON.stringify(entries, null, 2)}\n`;
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${process.pid}`;
  try {
    await new Promise((resolve, reject) => {
      const stream = createWriteStream(temporary, { encoding: "utf8" });
      stream.on("error", reject);
      stream.on("finish", resolve);
      stream.end(serialized);
    });
    await rename(temporary, destination);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

export async function buildDictionary() {
  const catalogWords = await loadCatalogWords();
  const { catalogEntries, fillerEntries } = await readEcdict(catalogWords);
  const entries = selectEntries(catalogWords, catalogEntries, fillerEntries);
  await writeStableJson(entries);
  console.log(`Wrote ${entries.length} entries (${catalogWords.size} catalog words) to ${outputPath}`);
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await buildDictionary();
}
