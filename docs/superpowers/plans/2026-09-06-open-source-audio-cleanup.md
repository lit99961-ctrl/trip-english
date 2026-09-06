# Open-source Audio Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Apple system-voice recordings from the repository while preserving simple normal/slow English playback through runtime speech synthesis.

**Architecture:** Course and emergency content will contain text only. Views will call `SpeechPort.speak(text, rate)` so the user's device chooses an available runtime voice without redistributing voice recordings. PWA readiness will cover the application shell and bundled learning data, with no audio asset group.

**Tech Stack:** TypeScript, Vitest, Vite PWA, Git

---

### Task 1: Specify the compliant content boundary

**Files:**
- Modify: `tests/content/catalog.test.ts`
- Modify: `tests/content/generated-assets.test.ts`

- [x] Add assertions that authored phrases have no bundled `audio` property and that the repository contains no AIFF files.
- [x] Run the focused content tests and confirm they fail against the current fixed-audio catalog.

### Task 2: Specify runtime speech playback

**Files:**
- Modify: `tests/features/emergency-view.test.ts`
- Modify: `tests/features/lesson-view.test.ts`
- Modify: `tests/features/offline-status.test.ts`

- [x] Change playback expectations to `speech.speak(english, 1 | 0.75)`.
- [x] Require offline preparation to report two groups and not depend on cached AIFF assets.
- [x] Run the focused feature tests and confirm the old fixed-audio calls fail.

### Task 3: Remove fixed audio and use runtime synthesis

**Files:**
- Modify: `src/content/missions.travel.ts`
- Modify: `src/content/missions.business.ts`
- Modify: `src/content/emergency-phrases.ts`
- Modify: `src/content/catalog.ts`
- Modify: `src/domain/content-schema.ts`
- Modify: `src/features/lesson/lesson-view.ts`
- Modify: `src/features/emergency/emergency-view.ts`
- Modify: `src/app/offline-status.ts`
- Modify: `vite.config.ts`
- Delete: `scripts/generate-fixed-audio.mjs`
- Delete: `public/audio/**`

- [x] Remove audio paths, the fixed-audio manifest, and the generator.
- [x] Use runtime speech synthesis for normal and slow playback.
- [x] Reduce offline readiness to the application shell and bundled learning data.
- [x] Run focused tests until green.

### Task 4: Correct public documentation and package commands

**Files:**
- Modify: `README.md`
- Modify: `THIRD_PARTY_NOTICES.md`
- Modify: `docs/device-checklist.md`
- Modify: `docs/iphone-install.md`
- Modify: `docs/design/context-puzzle-destination-packs.md`
- Modify: `package.json`

- [x] Remove claims and commands for bundled AIFF/Samantha output.
- [x] Explain that playback uses device/browser speech synthesis and availability depends on the device.

### Task 5: Verify and purge history

**Files:**
- Modify: Git history for `public/audio/**` and `scripts/generate-fixed-audio.mjs`

- [ ] Run full unit tests, production build, dependency audit, secret scan, and `git diff --check`.
- [ ] Commit the clean tree.
- [ ] Remove fixed-audio files and generator from every reachable commit while preserving unrelated history.
- [ ] Force-push the rewritten private `main`, then verify repository visibility and absence of prohibited paths.
