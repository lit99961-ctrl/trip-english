# Learn Before Practice Design

**Date:** 2026-09-08

**Status:** Approved for planning

## Problem

Trip English currently opens a mission with active recall and comprehension questions. That assumes the learner has already seen the material. For an A1 learner, the experience feels like a test rather than teaching: the learner is asked to retrieve or identify language before receiving a structured introduction.

The product must teach a complete, useful phrase set before formal practice while preserving its main outcome: the learner can understand common replies and complete essential travel interactions independently.

## Scope

This release expands seven high-priority Italy and Switzerland scenarios:

1. Hotel check-in
2. Restaurant ordering
3. Directions and tickets
4. Italian high-speed rail
5. Swiss trains and mountain transport
6. Supermarket shopping
7. Urgent help

The remaining six travel missions retain their current content and behavior until a later release. Existing mission, phrase, exercise, and progress identifiers must remain compatible.

## Learning Content

Each priority mission contains 16–20 learning sentences:

- 6–8 core production sentences that the learner should be able to say.
- 8–12 reception sentences that staff or local people may say to the learner.
- Every sentence includes short English, natural Chinese meaning, 1–4 keywords, and a concise usage note.
- Longer sentences include authored speaking chunks so an A1 learner can shadow them in parts.
- Grammar explanations are excluded. Notes explain practical meaning and when to use the sentence.

The content is organized around reusable sentence frames rather than isolated memorization. Priority frames include `I need ...`, `Where is ...?`, `Can I ...?`, `Is this ...?`, and `Could you show me ...?`. Mission-specific words replace the slots so a small number of patterns can produce many useful requests.

Five universal recovery expressions recur across the seven missions:

- `Could you speak more slowly?`
- `Could you say that again?`
- `Could you show me?`
- `Do you mean ...?`
- `I don't understand, but I need help.`

Repeated recovery expressions may be linked across missions, but every mission must practice at least one in its own context.

The existing production phrases remain stable. New phrases receive namespaced stable IDs. Reception sentences may reuse existing listening scenarios where the wording and meaning match.

## First-time Mission Flow

A learner who has not completed the mission introduction follows this sequence:

1. **Mission preview:** states the real-world outcome and estimated learning time.
2. **Learn every sentence:** displays Chinese, English, usage note, and keywords one sentence at a time.
3. **Listen and shadow:** provides normal and slow runtime speech. Production sentences also offer recording and listen-back, so speaking begins during learning rather than waiting until the formal challenge.
4. **Gentle recap:** after sentences 5, 10, and 15, shows a small recognition recap. It is unscored and cannot block progress.
5. **Phrase map:** shows all sentences grouped as “I may say” and “I may hear”.
6. **Formal practice:** continues into comprehension, supported speaking, prompt-free role-play, and reading.

The formal exercise engine is not replaced. The learning introduction is a prerequisite placed before it.

## Complete Conversation Loops

Each priority mission teaches and practices a complete task loop instead of a single opening request:

1. The learner states a need.
2. The other person gives a normal response.
3. The other person gives a change, constraint, or bad-news variation.
4. The learner confirms the critical information.
5. The learner uses a recovery expression when understanding fails.
6. The exchange ends with a clear task outcome.

Listening exercises draw from both normal and changed responses. Role-play requires a confirmation or recovery turn before completion. The task outcome—not accent imitation or perfect grammar—is the success criterion.

## Progress and Resume

Progress stores a per-mission introduction record containing:

- the next sentence index;
- IDs of sentences already viewed;
- completed recap checkpoints;
- completion timestamp.

Each sentence transition is saved before the next sentence appears. Closing, refreshing, or reopening the installed PWA resumes at the last incomplete sentence. Progress is local-first, remains compatible with the existing versioned document, and is included in backup and restore.

Existing users who have already completed any formal exercise in a mission are treated as having completed that mission's introduction. This prevents a new release from forcing them backward.

## Repeat Entry

After the introduction is complete, the mission entry screen offers:

- **Quick review** — the visually recommended option, showing core sentences and allowing the learner to revisit weak items.
- **Start challenge** — enters the existing formal exercises immediately.

The complete introduction remains available from the quick-review screen but is never forced again.

## Speech, Selection, and Offline Behavior

- Every English sentence supports normal and slow runtime speech.
- English remains native selectable, so the existing selection toolbar can speak, look up, or save selected text.
- Production sentences support recording and listen-back using the existing speech port.
- Text, meanings, notes, keywords, progress, and dictionary lookup remain available offline.
- Runtime speech works offline when the device has an appropriate English voice; failure produces a visible fallback message and never blocks learning.
- No camera, account, server, analytics, or third-party prerecorded voice assets are added.

## Interface Rules

- One primary action appears on each screen.
- Previous and next navigation is available during learning, but moving forward always saves first.
- Progress is shown as a simple count such as `5 / 18`, without scores, lives, streak loss, or failure language.
- Recaps use encouraging correction and reveal the answer immediately when needed.
- Controls meet the existing 44-pixel touch target, safe-area, Dynamic Type, keyboard, and reduced-motion requirements.

## Evidence of Learning

The interface distinguishes five evidence levels and never treats card completion as mastery:

1. **Viewed** — the sentence was presented.
2. **Shadowed** — the learner listened and attempted to repeat it.
3. **Recognized** — the learner identified its spoken or written meaning.
4. **Recalled** — the learner produced the idea from a Chinese or situational prompt.
5. **Task-ready** — the learner completed an unprompted conversation loop, including confirmation or recovery when required.

Only recalled and task-ready evidence contributes to travel-readiness progress. Pronunciation feedback remains tolerant of accent and minor grammar errors when meaning is understandable.

## Daily Sprint Allocation

The existing 30-minute daily session prioritizes transfer to real travel:

- about 8 minutes learning new sentence frames and vocabulary;
- about 10 minutes listening to varied replies;
- about 10 minutes speaking and completing conversation loops;
- about 2 minutes reviewing items that still need support.

These are guidance targets rather than countdown gates. The interface does not rush or stop an A1 learner when a section takes longer.

To keep a 30-minute session realistic, the daily planner schedules at most one not-yet-introduced mission. Its other mission slots use quick review or formal challenge content already introduced. A learner may pause a first-time introduction and resume it the next day; formal exercises for that mission remain locked until the introduction is complete.

## Error Handling

- A failed progress write keeps the learner on the same sentence and changes the primary action to “重试保存”.
- A failed speech or recording operation shows a local accessible error and leaves silent reading available.
- Invalid or missing learning content fails catalog validation during development rather than producing a broken runtime screen.
- Concurrent or repeated saves are idempotent and cannot move sentence progress backward.

## Content and Domain Boundaries

Learning sentences are authored data validated by the content schema, not HTML embedded in a view. The catalog validates:

- 16–20 learning sentences for each of the seven priority missions;
- 6–8 production-role learning sentences;
- 8–12 reception-role learning sentences;
- stable namespaced unique IDs;
- valid phrase links where a learning sentence reuses a production phrase;
- complete English token coverage in the offline dictionary boundary.

The learning view consumes this validated content through a small mission-learning controller. Persistence exposes an atomic method for advancing an introduction without coupling the view to IndexedDB details.

## Testing and Acceptance

Automated coverage must prove:

- a new learner cannot enter formal exercises before completing the introduction;
- all seven priority missions contain 16–20 valid sentences with the required 6–8 production and 8–12 reception split;
- each priority mission contains a complete request, response variation, confirmation, recovery, and task-outcome loop;
- the five universal recovery expressions are covered and repeatedly practiced across the course;
- normal speech, slow speech, silent reading, recording, and listen-back paths remain usable;
- sentences 5, 10, and 15 produce non-blocking recap checkpoints;
- refresh and app restart resume the same incomplete sentence;
- persistence failure retries the same transition without skipping or duplicating progress;
- existing learners with formal progress are not forced backward;
- completed learners can choose quick review or direct challenge;
- viewed or shadowed sentences are never reported as mastered or task-ready;
- backup and restore retain introduction progress;
- legacy progress documents remain valid;
- mobile, offline, accessibility, unit, build, and end-to-end suites pass before deployment.

## Delivery Constraint

Implementation is performed in the current task without subagents, per the user's request to minimize token use. The repository remains free of the original private itinerary and redistributed voice recordings.
