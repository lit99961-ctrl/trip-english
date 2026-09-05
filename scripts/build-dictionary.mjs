import { createWriteStream } from "node:fs";
import { mkdir, rename, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse";
import { createServer } from "vite";

export const ECDICT_COMMIT = "bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b";
export const ECDICT_SOURCE_URL = "https://raw.githubusercontent.com/skywind3000/ECDICT/bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b/ecdict.csv";
const EXPECTED_COLUMNS = ["word", "phonetic", "definition", "translation", "pos", "collins", "oxford", "tag", "bnc", "frq", "exchange", "detail", "audio"];
const OUTPUT_SIZE = 1000;
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = join(projectRoot, "src/content/dictionary.generated.json");

// Audited catalog-only variants and proper names which are not guaranteed to be
// headwords in ECDICT. If ECDICT supplies one, its pinned-source entry wins.
const manualOverrides = new Map(Object.entries({
  "alex": "亚历克斯（人名）",
  "can't": "不能；无法",
  "don't": "不；不要",
  "florence": "佛罗伦萨",
  "gornergrat": "戈尔内格拉特",
  "grindelwald": "格林德瓦",
  "helsinki": "赫尔辛基",
  "interlaken": "因特拉肯",
  "italy": "意大利",
  "leo": "利奥（人名）",
  "leonardo": "莱昂纳多（人名）",
  "li": "李（姓氏）",
  "lucerne": "卢塞恩",
  "lungern": "伦根",
  "mia": "米娅（人名）",
  "rialto": "里亚托",
  "rome": "罗马",
  "switzerland": "瑞士",
  "termini": "特米尼火车站",
  "vatican": "梵蒂冈",
  "vaporetto": "威尼斯水上巴士",
  "venice": "威尼斯",
  "zermatt": "采尔马特",
  "zurich": "苏黎世"
}));

export function assertPinnedSourceUrl(url) {
  if (url !== ECDICT_SOURCE_URL || !url.includes(`/${ECDICT_COMMIT}/`)) {
    throw new Error(`ECDICT source must be pinned to ${ECDICT_COMMIT}`);
  }
}

export function normalizeEnglishWords(text) {
  const normalized = text.normalize("NFKC").replace(/[\u2018\u2019]/gu, "'").toLowerCase();
  return normalized.match(/[\p{L}]+(?:['-][\p{L}]+)*/gu) ?? [];
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
    return new Set(displayedModule.displayedEnglish
      .flatMap(normalizeEnglishWords)
      .filter((word) => word.length > 1));
  } finally {
    await server.close();
  }
}

function assertHeader(columns) {
  const missing = EXPECTED_COLUMNS.filter((column) => !columns.includes(column));
  if (missing.length > 0) throw new Error(`malformed ECDICT header; missing columns: ${missing.join(", ")}`);
}

async function readEcdict(catalogWords) {
  assertPinnedSourceUrl(ECDICT_SOURCE_URL);
  const response = await fetch(ECDICT_SOURCE_URL);
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
  Readable.fromWeb(response.body).pipe(parser);

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
  if (!checkedHeader) throw new Error("malformed ECDICT source: no CSV header");
  return { catalogEntries, fillerEntries };
}

function withoutRanks(entry) {
  return { word: entry.word, phonetic: entry.phonetic, chinese: entry.chinese, tags: entry.tags };
}

export function selectEntries(catalogWords, catalogEntries, fillerEntries) {
  for (const word of [...catalogWords].sort()) {
    if (!catalogEntries.has(word) && manualOverrides.has(word)) {
      catalogEntries.set(word, { word, phonetic: null, chinese: manualOverrides.get(word), tags: ["catalog", "manual"], bnc: Number.POSITIVE_INFINITY, frq: Number.POSITIVE_INFINITY });
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

async function writeStableJson(entries) {
  await mkdir(dirname(outputPath), { recursive: true });
  const temporary = `${outputPath}.tmp-${process.pid}`;
  try {
    await new Promise((resolve, reject) => {
      const stream = createWriteStream(temporary, { encoding: "utf8" });
      stream.on("error", reject);
      stream.on("finish", resolve);
      stream.end(`${JSON.stringify(entries, null, 2)}\n`);
    });
    await rename(temporary, outputPath);
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
