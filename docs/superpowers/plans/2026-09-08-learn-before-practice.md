# Learn Before Practice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach complete practical phrase sets in seven priority travel missions before asking an A1 learner to complete formal exercises.

**Architecture:** Add validated, authored learning sentences as a content layer separate from formal exercises. Persist an idempotent per-mission introduction cursor in the existing progress document, render it through a focused learning view, and gate lesson routes until the introduction is complete. Preserve every existing mission, phrase, exercise, and progress identifier.

**Tech Stack:** TypeScript, Zod, IndexedDB/idb, browser speech and recording ports, Vitest, Playwright, Vite PWA

---

### Task 1: Validated learning-content model

**Files:**
- Modify: `src/domain/content-schema.ts`
- Create: `src/content/mission-learning.ts`
- Modify: `src/content/missions.travel.ts`
- Modify: `src/content/displayed-english.ts`
- Test: `tests/domain/content-schema.test.ts`
- Test: `tests/content/course-coverage.test.ts`
- Test: `tests/content/generated-assets.test.ts`

- [ ] **Step 1: Write failing schema tests**

Add tests requiring namespaced IDs, roles, Chinese meaning, usage note, 1–4 keywords, nonempty speaking chunks, and an optional existing phrase link:

```ts
const learningSentence = {
  id: "hotel-checkin-i-have-reservation",
  role: "production",
  english: "I have a reservation.",
  chinese: "我有预订。",
  usageZh: "到前台后先说明已经预订。",
  keywords: ["reservation"],
  chunks: ["I have", "a reservation"],
  phraseId: "hotel-checkin-reservation"
};
expect(learningSentenceSchema.parse(learningSentence)).toEqual(learningSentence);
expect(() => learningSentenceSchema.parse({ ...learningSentence, chunks: [] })).toThrow();
```

- [ ] **Step 2: Run the schema test and verify RED**

Run: `npm test -- tests/domain/content-schema.test.ts`

Expected: FAIL because `learningSentenceSchema` and mission `learningSentences` do not exist.

- [ ] **Step 3: Implement the schema**

Add these fields and refinements:

```ts
export const learningSentenceSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  role: z.enum(["production", "reception"]),
  english: trimmedNonemptyString,
  chinese: trimmedNonemptyString,
  usageZh: trimmedNonemptyString,
  keywords: z.array(trimmedNonemptyString).min(1).max(4),
  chunks: z.array(trimmedNonemptyString).min(1).max(4),
  phraseId: z.string().min(1).optional()
}).strict();
```

Add optional `learningSentences` to the shared mission fields. In catalog validation, require every learning ID to begin with `${mission.id}-`, require global uniqueness, and validate every supplied `phraseId` against that mission's production phrases.

- [ ] **Step 4: Add failing coverage tests for the seven mission packs**

For `hotel-checkin`, `restaurant`, `directions-tickets`, `italy-high-speed-rail`, `swiss-mountain-transit`, `supermarket-groceries`, and `urgent-help`, assert:

```ts
expect(mission.learningSentences.length).toBeGreaterThanOrEqual(16);
expect(mission.learningSentences.length).toBeLessThanOrEqual(20);
expect(byRole.production.length).toBeGreaterThanOrEqual(6);
expect(byRole.production.length).toBeLessThanOrEqual(8);
expect(byRole.reception.length).toBeGreaterThanOrEqual(8);
expect(byRole.reception.length).toBeLessThanOrEqual(12);
```

Also assert that all five canonical recovery frames occur across the packs and each pack contains at least one recovery phrase.

- [ ] **Step 5: Run the coverage test and verify RED**

Run: `npm test -- tests/content/course-coverage.test.ts`

Expected: FAIL because the seven packs are absent.

- [ ] **Step 6: Author the seven packs**

Create `mission-learning.ts` with immutable data grouped by mission. Each pack must cover this complete loop:

```ts
type ConversationCoverage = {
  request: string;
  normalResponse: string;
  changedResponse: string;
  confirmation: string;
  recovery: string;
  outcome: string;
};
```

Use 6–8 short learner utterances and 8–12 likely replies. Cover these scenario-specific changes: room not ready; table wait/allergy; ticket price/time/validation; platform change/delay/cancellation; missed connection/weather/last train; weigh-by-kilo/card failure; lost group/phone battery/medical help. Reuse existing phrase IDs wherever the English meaning matches exactly.

- [ ] **Step 7: Attach packs and extend the dictionary boundary**

Attach a cloned pack in `travelMission()` when the mission ID is present. Include every learning sentence's English and chunks in `displayedEnglishTexts()`, then run:

```bash
npm run content:dictionary
npm test -- tests/content/generated-assets.test.ts
```

Expected: dictionary remains exactly 1,000 unique entries and independently covers every displayed learning token.

- [ ] **Step 8: Run focused tests and commit**

Run: `npm test -- tests/domain/content-schema.test.ts tests/content/course-coverage.test.ts tests/content/catalog.test.ts tests/content/generated-assets.test.ts`

Expected: PASS.

```bash
git add src/domain/content-schema.ts src/content tests/domain tests/content
git commit -m "feat: add priority mission learning packs"
```

### Task 2: Resumable introduction progress

**Files:**
- Modify: `src/domain/progress.ts`
- Modify: `src/storage/progress-repository.ts`
- Modify: `src/storage/indexeddb-progress-repository.ts`
- Create: `tests/domain/progress.test.ts`
- Test: `tests/storage/progress-repository.test.ts`
- Test: `tests/storage/backup-codec.test.ts`

- [ ] **Step 1: Write failing progress-schema tests**

Define expected persisted state:

```ts
missionIntroductions: {
  "hotel-checkin": {
    missionId: "hotel-checkin",
    nextSentenceIndex: 5,
    viewedSentenceIds: ["hotel-checkin-i-have-reservation"],
    shadowedSentenceIds: ["hotel-checkin-i-have-reservation"],
    completedRecapIndexes: [5],
    completedAt: undefined
  }
}
```

Assert legacy documents without `missionIntroductions` remain valid; reject negative cursors, duplicate IDs, recap indexes outside `[5, 10, 15]`, and timestamps that are not ISO datetimes.

- [ ] **Step 2: Run schema tests and verify RED**

Run: `npm test -- tests/domain/progress.test.ts`

Expected: FAIL because introduction progress is not retained.

- [ ] **Step 3: Add the optional v1-compatible field**

Add an optional record to `learnerProgressV1Schema` rather than changing `schemaVersion`. Export `MissionIntroductionProgress` from the inferred schema. New progress may omit the field until the first introduction write.

- [ ] **Step 4: Write failing atomic repository tests**

Add tests for this discriminated interface:

```ts
type AdvanceMissionIntroductionInput =
  | {
      kind: "sentence";
      missionId: string;
      orderedSentenceIds: readonly string[];
      expectedIndex: number;
      sentenceId: string;
      shadowed: boolean;
    }
  | { kind: "recap"; missionId: string; atIndex: 5 | 10 | 15 }
  | {
      kind: "complete";
      missionId: string;
      orderedSentenceIds: readonly string[];
      completedAt: string;
    };

advanceMissionIntroduction(input: AdvanceMissionIntroductionInput): Promise<LearnerProgressV1>;
```

Prove first sentence write advances, identical retry is idempotent, stale writes cannot move backward or skip forward, two repository instances preserve the first valid transition, recap acknowledgement cannot advance the sentence cursor, completion requires the persisted viewed IDs to equal `orderedSentenceIds`, and backup/restore round-trips the record.

- [ ] **Step 5: Run repository tests and verify RED**

Run: `npm test -- tests/storage/progress-repository.test.ts tests/storage/backup-codec.test.ts`

Expected: FAIL because the method is missing.

- [ ] **Step 6: Implement the atomic transaction**

Inside one IndexedDB `progress` read-write transaction: load and migrate; compare `expectedIndex` for sentence events; require `sentenceId === orderedSentenceIds[expectedIndex]`; allow an identical already-applied transition; append de-duplicated viewed, shadowed, or recap evidence; permit completion only when persisted viewed IDs equal the supplied ordered list; write the migrated result; await transaction completion. Validate IDs, index bounds, recap positions, and ISO timestamps before opening the transaction.

- [ ] **Step 7: Preserve existing learners**

Add a pure helper:

```ts
export function introductionComplete(progress, mission): boolean {
  if (progress.missionIntroductions?.[mission.id]?.completedAt) return true;
  return (progress.sessions[mission.id]?.completedExerciseIds.length ?? 0) > 0;
}
```

Test that formal progress from the current public release bypasses the new prerequisite.

- [ ] **Step 8: Run focused tests and commit**

Run: `npm test -- tests/domain/progress.test.ts tests/storage/progress-repository.test.ts tests/storage/backup-codec.test.ts`

Expected: PASS.

```bash
git add src/domain/progress.ts src/storage tests/domain tests/storage
git commit -m "feat: persist mission introductions"
```

### Task 3: First-time learning controller and view

**Files:**
- Create: `src/domain/mission-learning.ts`
- Create: `src/features/learning/learning-view.ts`
- Create: `tests/domain/mission-learning.test.ts`
- Create: `tests/features/learning-view.test.ts`
- Modify: `src/styles/global.css`

- [ ] **Step 1: Write failing controller tests**

Test pure navigation states for sentence, recap at indexes 5/10/15, and final phrase map:

```ts
expect(nextLearningScreen(pack, { nextSentenceIndex: 4, completedRecapIndexes: [] }))
  .toEqual({ type: "sentence", index: 4 });
expect(nextLearningScreen(pack, { nextSentenceIndex: 5, completedRecapIndexes: [] }))
  .toEqual({ type: "recap", index: 5 });
expect(nextLearningScreen(pack, completeCursor)).toEqual({ type: "phrase-map" });
```

- [ ] **Step 2: Run controller tests and verify RED**

Run: `npm test -- tests/domain/mission-learning.test.ts`

Expected: FAIL because the controller does not exist.

- [ ] **Step 3: Implement pure screen selection**

Export `nextLearningScreen`, `learningProgressLabel`, and `groupPhraseMap`. Keep DOM, speech, recording, clocks, and persistence outside this module.

- [ ] **Step 4: Write failing view tests**

Assert one primary action; `5 / 18` progress; Chinese, English, note, keywords, and chunks; normal speech at `1`; slow speech at `0.75`; production-only recording/listen-back; native selectable English; back navigation; recap answer reveal without scoring; phrase map groups “我可能要说” and “我可能听到”; persistence failure displays `重试保存` and retains the exact sentence.

- [ ] **Step 5: Run view tests and verify RED**

Run: `npm test -- tests/features/learning-view.test.ts`

Expected: FAIL because `renderLearning` does not exist.

- [ ] **Step 6: Implement the view**

Use this boundary:

```ts
interface LearningViewOptions {
  mission: DeepReadonly<Mission>;
  progress: LearnerProgressV1;
  repository: Pick<ProgressRepository, "advanceMissionIntroduction">;
  speech: Pick<SpeechPort, "speak" | "startRecording">;
  onComplete: () => void;
}
```

Create sentence, recap, and phrase-map render functions. Save before rendering the next sentence. Retain one pending payload across retry. Stop active recording and revoke object URLs in `dispose()`.

- [ ] **Step 7: Add mobile styles**

Add focused classes for learning cards, chunk pills, role labels, recap choices, and phrase-map groups. Keep all controls at least 44px, preserve native selection, use the existing 430px layout and safe-area bottom padding, and disable decorative transitions under reduced motion.

- [ ] **Step 8: Run focused tests and commit**

Run: `npm test -- tests/domain/mission-learning.test.ts tests/features/learning-view.test.ts tests/speech/browser-speech.test.ts tests/features/selection-controller.test.ts`

Expected: PASS.

```bash
git add src/domain/mission-learning.ts src/features/learning src/styles/global.css tests/domain/mission-learning.test.ts tests/features/learning-view.test.ts
git commit -m "feat: teach phrases before practice"
```

### Task 4: Route gating and repeat-entry choices

**Files:**
- Create: `src/features/mission-entry/mission-entry-view.ts`
- Create: `tests/features/mission-entry-view.test.ts`
- Modify: `src/app/router.ts`
- Modify: `src/app/create-app.ts`
- Modify: `src/features/home/home-view.ts`
- Modify: `src/features/sprint/sprint-view.ts`
- Test: `tests/features/app-shell.test.ts`
- Test: `tests/features/home-view.test.ts`
- Test: `tests/features/sprint-view.test.ts`

- [ ] **Step 1: Write failing routing and entry tests**

Assert that a new learner opening either `#/lesson/hotel-checkin` or `#/sprint/lesson/hotel-checkin` sees `.learning-view`, never `.lesson-view`. Assert existing formal progress opens the lesson. Assert completed introductions show an entry screen with exactly one recommended primary “快速复习” action and one secondary “直接挑战” action.

- [ ] **Step 2: Run app tests and verify RED**

Run: `npm test -- tests/features/app-shell.test.ts tests/features/mission-entry-view.test.ts`

Expected: FAIL because lesson routes are not gated and the entry view is missing.

- [ ] **Step 3: Add validated learning routes**

Extend `AppRoute` with `#/learn/:missionId` and `#/sprint/learn/:missionId`. Use the same mission-ID validation as lesson routes. Never accept arbitrary IDs or HTML from the hash.

- [ ] **Step 4: Implement route decisions**

Centralize this decision in a pure helper:

```ts
type MissionDestination = "learning" | "entry" | "lesson";
function missionDestination(progress, mission, explicitChallenge): MissionDestination {
  if (!introductionComplete(progress, mission)) return "learning";
  return explicitChallenge ? "lesson" : "entry";
}
```

Home and Sprint open the mission entry path. A direct challenge route still gates an incomplete introduction. Learning completion routes to the formal lesson on first completion. Repeat “快速复习” opens the completed pack from sentence one without clearing evidence; “直接挑战” opens the existing lesson.

- [ ] **Step 5: Enforce at most one new mission per daily sprint**

Add a failing `daily-plan` test with three unfinished missions and introduction state. Extend each daily plan with a backward-compatible optional `steps` tuple while retaining the current `missionIds` field for existing saved plans:

```ts
type DailyStep =
  | { kind: "mission"; missionId: string; mode: "introduction" | "challenge" }
  | { kind: "review"; slot: "morning" | "midday" | "evening" };

type DailyPlan = {
  missionIds: [string, string, string];
  steps?: [DailyStep, DailyStep, DailyStep];
};
```

For a legacy plan without `steps`, derive and atomically save them on first load. Select no more than one `introduction` step. Prefer introduced unfinished or due missions as `challenge` steps; when fewer than two are available, fill the remaining positions with distinct quick-review slots. Update Sprint rendering so mission steps open learning/challenge routes and review steps open the existing review routes.

- [ ] **Step 6: Run route and planner tests and commit**

Run: `npm test -- tests/features/app-shell.test.ts tests/features/mission-entry-view.test.ts tests/features/home-view.test.ts tests/features/sprint-view.test.ts tests/domain/daily-plan.test.ts`

Expected: PASS.

```bash
git add src/app src/features/home src/features/sprint src/features/mission-entry src/domain/daily-plan.ts tests/features tests/domain/daily-plan.test.ts
git commit -m "feat: gate challenges behind first-time learning"
```

### Task 5: Evidence labels and travel-readiness measurement

**Files:**
- Modify: `src/domain/lesson-engine.ts`
- Modify: `src/domain/progress.ts`
- Modify: `src/features/progress/progress-view.ts`
- Modify: `src/features/home/home-view.ts`
- Test: `tests/domain/lesson-engine.test.ts`
- Test: `tests/features/progress-view.test.ts`
- Test: `tests/features/home-view.test.ts`

- [ ] **Step 1: Write failing evidence-level tests**

Assert that viewed and shadowed evidence never produces `recalled`, `mastered`, or task-ready labels. Require a prompt-free production attempt for recalled and a successful prompt-free role-play with confirmation or recovery scenario metadata for task-ready.

- [ ] **Step 2: Run evidence tests and verify RED**

Run: `npm test -- tests/domain/lesson-engine.test.ts tests/features/progress-view.test.ts`

Expected: FAIL because introduction evidence is not separated from formal evidence and task-ready is not reported.

- [ ] **Step 3: Implement conservative labels**

Keep existing attempt classification backward compatible. Add a derived presentation helper returning `viewed`, `shadowed`, `recognized`, `recalled`, or `task-ready` from stored evidence. Do not store a second mutable mastery truth.

- [ ] **Step 4: Update progress and home presentation**

Show counts for learned sentences, listening recognition, active recall, and task-ready conversation loops. City stamps remain conservative: incomplete phrase coverage cannot display a mastered or task-ready stamp.

- [ ] **Step 5: Run focused tests and commit**

Run: `npm test -- tests/domain/lesson-engine.test.ts tests/features/progress-view.test.ts tests/features/home-view.test.ts`

Expected: PASS.

```bash
git add src/domain src/features/progress src/features/home tests/domain tests/features
git commit -m "feat: measure travel-ready learning evidence"
```

### Task 6: Documentation, compatibility, and release verification

**Files:**
- Modify: `README.md`
- Modify: `docs/iphone-install.md`
- Modify: `docs/device-checklist.md`
- Modify: `e2e/learning-flow.spec.ts`
- Modify: `e2e/offline.spec.ts`
- Modify: `e2e/accessibility.spec.ts`

- [ ] **Step 1: Write failing end-to-end coverage**

Cover first launch → learning sentence → persisted refresh → recap → phrase map → challenge; direct lesson deep-link gating; existing-progress compatibility; quick review; runtime speech failure fallback; offline reopening; backup/restore; and a phone viewport with no horizontal overflow.

- [ ] **Step 2: Run E2E and verify RED**

Run: `npm run test:e2e`

Expected: at least the first-time learning flow fails before final integration.

- [ ] **Step 3: Update user documentation**

Explain the seven expanded packs, 6–8 say/8–12 hear split, first-time prerequisite, local resume, quick review, system voice dependency, offline behavior, and how readiness differs from viewing cards.

- [ ] **Step 4: Run complete verification**

```bash
npm test
npm run build
npm run test:e2e
npm audit --registry=https://registry.npmjs.org --audit-level=high
git diff --check
```

Expected: all tests pass, the production build succeeds, audit reports zero high-severity vulnerabilities, and diff check is clean.

- [ ] **Step 5: Run privacy and generated-media checks**

Verify no itinerary workbook, environment file, credential pattern, AIFF file, or fixed-audio generator exists in the worktree or Git history. Confirm the 1,000-word dictionary remains the only generated language asset.

- [ ] **Step 6: Commit, push, deploy, and inspect**

```bash
git add README.md docs e2e
git commit -m "release: add learn before practice flow"
git push origin main
```

Wait for the GitHub Pages workflow to succeed. Open the live Home, learning, recap, mission entry, lesson, emergency, and progress screens in the explicitly requested in-app browser at an iPhone-sized viewport. Confirm zero console errors and restore the viewport override afterward.
