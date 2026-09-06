# Travel-ready Sprint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an iPhone-installable Italy and Switzerland English sprint with practical listening variation, supermarket coverage, one 30-minute daily plan, and three short daily reviews.

**Architecture:** Keep authored learning content data-driven. Add structured listening scenarios to selected missions, append one compatible supermarket mission, derive and persist a stable three-mission daily plan, and reuse the existing exactly-once lesson event repository for quick-review attempts. Add small sprint/review views and hash routes without adding accounts or a server.

**Tech Stack:** TypeScript, Zod, IndexedDB/idb, Vitest, Playwright, Vite PWA

---

### Task 1: Structured listening content and supermarket mission

**Files:**
- Modify: `src/domain/content-schema.ts`
- Modify: `src/content/missions.travel.ts`
- Modify: `src/content/catalog.ts`
- Modify: `src/content/displayed-english.ts`
- Regenerate: `src/content/dictionary.generated.json`
- Test: `tests/domain/content-schema.test.ts`
- Test: `tests/content/course-coverage.test.ts`
- Test: `tests/content/catalog.test.ts`
- Test: `tests/content/generated-assets.test.ts`

- [ ] Add failing schema tests for a listening scenario with a stable ID, short English transcript, Chinese meaning, two distinct Chinese distractors, and 1–4 keywords.
- [ ] Add failing coverage tests requiring three scenarios for `hotel-checkin`, `restaurant`, `directions-tickets`, `italy-high-speed-rail`, and `supermarket-groceries`.
- [ ] Add a failing course test requiring `supermarket-groceries` to be appended after all existing travel IDs with six practical phrases and the existing six-exercise mix.
- [ ] Implement optional `listeningScenarios` on missions and validate scenario/mission IDs and uniqueness in `validateCatalog`.
- [ ] Author the five scenario sets. Each set contains confirmation, negative/change, and time/price/location variants.
- [ ] Append `supermarket-groceries` with price, kilo, bag, card, receipt, self-checkout/weigh context, and a recovery phrase.
- [ ] Update course session and active-target assertions without changing any existing ID or order.
- [ ] Regenerate the 1,000-word dictionary and verify every newly displayed word is covered.
- [ ] Run `npm test -- tests/domain/content-schema.test.ts tests/content/course-coverage.test.ts tests/content/catalog.test.ts tests/content/generated-assets.test.ts` and expect all focused tests to pass.
- [ ] Commit with `feat: add practical listening and supermarket content`.

### Task 2: Listening-first lesson interaction

**Files:**
- Modify: `src/features/lesson/lesson-view.ts`
- Test: `tests/features/lesson-view.test.ts`

- [ ] Add a failing test that a mission scenario, rather than the user's target phrase, is spoken during comprehension.
- [ ] Add a failing test for three authored meaning choices, correct/incorrect feedback, normal and slow replay, and a “显示文字” silent alternative.
- [ ] Add a failing retry test proving the chosen scenario and saved attempt metadata stay stable after persistence failure.
- [ ] Select the scenario deterministically from persisted attempt history so refresh does not unexpectedly change it.
- [ ] Render scenario listening controls and staged hints; never block completion after an incorrect choice.
- [ ] Store the scenario ID on the existing attempt event while retaining choice-only mastery rules.
- [ ] Run `npm test -- tests/features/lesson-view.test.ts tests/storage/progress-repository.test.ts` and expect all tests to pass.
- [ ] Commit with `feat: train varied staff responses`.

### Task 3: Stable 30-minute daily plan

**Files:**
- Create: `src/domain/daily-plan.ts`
- Create: `src/features/sprint/sprint-view.ts`
- Create: `tests/domain/daily-plan.test.ts`
- Create: `tests/features/sprint-view.test.ts`
- Modify: `src/domain/progress.ts`
- Modify: `src/storage/progress-repository.ts`
- Modify: `src/storage/indexeddb-progress-repository.ts`
- Modify: `src/features/home/home-view.ts`
- Modify: `src/app/router.ts`
- Modify: `src/app/create-app.ts`
- Test: `tests/storage/progress-repository.test.ts`
- Test: `tests/features/home-view.test.ts`
- Test: `tests/features/app-shell.test.ts`

- [ ] Add failing domain tests selecting three unique unfinished travel missions, preferring the active/due mission and remaining stable for a given saved plan.
- [ ] Add optional `dailyPlans[YYYY-MM-DD] = { missionIds }` progress data with strict validation and legacy compatibility.
- [ ] Add failing repository tests for atomic `ensureDailyPlan`, concurrent first-writer stability, validation, and backup-compatible loading.
- [ ] Implement `ensureDailyPlan` in the repository and retain only the latest 31 dated plans.
- [ ] Add failing Home tests for one primary “开始/继续今天的 30 分钟训练” card and the three mission summary.
- [ ] Add failing Sprint tests for step `1/3` through completion, resume after refresh, and one primary action.
- [ ] Implement `#/sprint` and `#/sprint/lesson/:missionId` routes; lessons launched by the sprint return to the sprint, while ordinary lessons return home.
- [ ] Run `npm test -- tests/domain/daily-plan.test.ts tests/storage/progress-repository.test.ts tests/features/home-view.test.ts tests/features/sprint-view.test.ts tests/features/app-shell.test.ts` and expect all tests to pass.
- [ ] Commit with `feat: add resumable daily training`.

### Task 4: Three two-minute daily reviews

**Files:**
- Create: `src/domain/daily-review.ts`
- Create: `src/features/review/review-view.ts`
- Create: `tests/domain/daily-review.test.ts`
- Create: `tests/features/review-view.test.ts`
- Modify: `src/features/home/home-view.ts`
- Modify: `src/app/router.ts`
- Modify: `src/app/create-app.ts`
- Test: `tests/features/home-view.test.ts`
- Test: `tests/features/app-shell.test.ts`
- Test: `tests/storage/progress-repository.test.ts`

- [ ] Add failing planner tests for morning, midday, and evening cards with at most three items: prompt-free phrase recall, listening meaning, and reading keyword.
- [ ] Prefer due phrase reviews; fall back deterministically to an unmastered active phrase when nothing is due.
- [ ] Add failing view tests for reveal/self-rating, normal/slow scenario speech, silent transcript reveal, reading confirmation, and one primary action per screen.
- [ ] Persist completion through the existing `daily-review` lesson session using stable date/slot exercise, event, and attempt IDs so retries are exactly once and update the phrase review schedule.
- [ ] Add three Home review cards with completed state and routes `#/review/morning`, `#/review/midday`, and `#/review/evening`.
- [ ] Ensure saved failures show “重试保存” and keep the same review content and payload.
- [ ] Run `npm test -- tests/domain/daily-review.test.ts tests/features/review-view.test.ts tests/features/home-view.test.ts tests/features/app-shell.test.ts tests/storage/progress-repository.test.ts` and expect all tests to pass.
- [ ] Commit with `feat: add daily travel reviews`.

### Task 5: Mobile polish, release verification, and publication

**Files:**
- Modify: `src/styles/global.css`
- Modify: `README.md`
- Modify: `docs/device-checklist.md`
- Modify: `docs/iphone-install.md`
- Modify: `e2e/learning-flow.spec.ts`
- Modify: `e2e/offline.spec.ts`
- Modify: `e2e/accessibility.spec.ts`

- [ ] Add failing E2E coverage for calibration → daily sprint → supermarket mission entry, one quick review, refresh resume, and offline reopening.
- [ ] Add mobile styles for the daily plan, three review cards, listening choices, safe areas, Dynamic Type, reduced motion, and 44px controls.
- [ ] Update user documentation for the 13-session route, runtime speech, 30-minute training, and three daily reviews.
- [ ] Run `npm test`, `npm run build`, and `npm run test:e2e`; require zero failures.
- [ ] Run dependency audit, secret/history scan, generated-media scan, and `git diff --check`.
- [ ] Keep the repository private until every automated check passes, then change it to public and verify GitHub Pages deploys the cleaned commit.
- [ ] Open the live site in the in-app browser and verify Home, Sprint, Review, Emergency, and Progress at a phone-sized viewport.
- [ ] Commit with `release: publish travel ready sprint` and push `main`.
