# Frameforge: Persistent Character References & Cross-Clip Consistency

**Document type:** Technical specification  
**Status:** Proposed; implementation and provider selection required  
**Audience:** Product, frontend, backend, AI/media, security, QA  
**Version:** 1.0  

## 1. Purpose

Add project-scoped character references that survive refreshes and sign-ins, can be attached to scenes and clips, and support two distinct forms of continuity review:

1. **Script continuity:** detect contradictions in character identity, appearance, costume, props, location, chronology, and scene-to-scene state in a structured multi-scene script.
2. **Visual cross-clip consistency:** compare user-authorized frames from separate clips against the same explicit character reference and report observable mismatches with evidence and uncertainty.

The system must make references reusable across a project's scenes and clips without claiming that generated characters are guaranteed to be identical. A check is advisory quality control, not proof of identity or a substitute for user review.

## 2. Current-state constraints and architectural fit

Frameforge currently has Firebase Authentication, direct client-side Firestore operations scoped under `/users/{uid}`, a Node server that verifies Firebase ID tokens for AI APIs, a Home story endpoint that returns three varied standalone story drafts, and a browser editor that imports a primary video plus video-overlay layers and stores project/layer metadata. The editor's current source-media behavior is local/temporary; imported media is not automatically a durable, cross-device cloud asset. Firestore rules currently cover user task documents and project documents, but do not yet grant or define nested character/scene/clip subcollections.

There is **no implemented video-generation provider, persistent character-reference feature, structured scene-script model, visual similarity evaluator, sequential multi-clip timeline, or clip-consistency API**. Pixabay integration searches existing stock media and is not a generative video capability. Therefore:

- This specification defines provider interfaces and product behavior; it does not assume a provider/model has been selected or is available.
- The first deliverable can implement structured scripts, reference metadata, local media storage, and deterministic/script-level checks without an AI video provider.
- Visual clip analysis and generated-clip workflows must remain visibly unavailable until a provider, image/frame transfer path, privacy disclosures, limits, and costs are verified and configured.

## 3. Goals and non-goals

### Goals

- Create, edit, archive, and reuse named character records within a project.
- Store a canonical character description and user-selected visual reference(s), with explicit user control over local-only versus cloud-synced media.
- Structure stories as ordered scenes and clips with stable character IDs and continuity state.
- Check script continuity deterministically where possible and use a separately configured multimodal evaluator only for checks that need semantic judgment.
- Compare clips to selected references and report per-character/per-attribute findings, evidence timecodes, confidence, and limitations.
- Make sync, analysis, and generation status visible and recoverable after errors.
- Preserve existing project and editor data; do not silently upload existing media or transform a story draft into a generation request.

### Non-goals

- Guarantee identical characters, artistic quality, or plot correctness.
- Identify real people, infer a person's identity, or create a biometric identity database.
- Clone voices or infer sensitive attributes. Voice is optional descriptive metadata only; no voiceprint collection.
- Automatically generate video before a user confirms the script, references, provider, and any charge/usage conditions.
- Replace Frameforge's editor renderer with a cloud rendering system in this feature.
- Treat Pixabay stock search results as generated scenes or as evidence of provider-level character continuity.

## 4. User experience and workflows

### 4.1 Character library

Add a **Characters** panel at project level. It lists each character's name, reference thumbnail, whether media is `This device only` or `Synced`, and any missing-media state. Actions: create, edit, duplicate, archive/delete, attach to scene, open reference, and run an explicit consistency check. Require a confirmation step before deleting a character that is still referenced by scenes or clips; offer replace/unlink options rather than leaving dangling records.

A character record includes a name, aliases, narrative role, concise canonical description, visual attributes, invariant attributes, allowed variations, and optional user notes. Attribute fields should be explicit and editable, not only free-form prompt text. Examples include apparent age range (user-authored description, not inferred), hair style/color, skin-tone description (only if supplied by the user), eye/face details (text description only), silhouette/build, signature clothing/accessories, distinguishing fictional marks, and permitted costume variants. Include `mustKeep` and `mayVary` lists so continuity checks do not treat intentional changes as errors.

Users may add one or more reference images or approved keyframes. Before upload to any remote service, show the exact data-transfer purpose, destination/provider, retention behavior if known, and ask for explicit opt-in. Store only local media by default. The user must be able to replace/remove a reference and see whether it is available on this device or synced.

### 4.2 Structured script and scene planning

Add a script/project action to turn one chosen draft into an editable, ordered scene plan. This is separate from the existing `Generate story` flow, which returns three standalone stories. The scene planner should produce a schema-validated draft containing scenes, stable character IDs, locations, time/order, visible state at scene start/end, relevant props, costume, and the scene's narrative purpose. Users must review and edit before scenes are committed or sent to any generation provider.

Every scene has explicit character membership. A character not listed in a scene should not be evaluated as expected to appear. For each present character, capture the intended costume/appearance variant and state transitions. Scene transitions can express facts such as `prop: brass key` acquired in scene 2 and retained until explicitly lost, or `costume: raincoat` removed after entering the shelter. Do not infer continuity errors when the script marks an intentional change.

### 4.3 Clip attachment and mapping

A clip is a media item attached to one or more scene IDs, in a defined order in the project sequence. The initial implementation may support manual clip mapping independently of sequential timeline editing. Do not misrepresent the current video-overlay lane as sequential editing: overlays are superimposed on the primary clip's timeline. Later sequential-editing work must define clip start/end, trim ranges, transitions, and audio behavior explicitly.

For every clip-to-scene mapping, users can specify which characters are expected, select the project character record, select its approved reference, and mark a clip as an intentional variation (e.g., disguise, aging, dream sequence). If a clip or reference is local-only, cross-device checks must say it is unavailable until the media is brought onto that device or explicitly synced.

### 4.4 Consistency report

An explicit **Check continuity** action runs checks only on the selected script/scenes/clips. Show scope before submission, then show progress and a report grouped as:

- **Blocking structural issues:** invalid references, missing scene links, duplicate order keys, broken required transition data.
- **Script contradictions:** a prior assertion conflicts with a later scene without a declared transition.
- **Visual differences:** only when an available evaluator has actually inspected the relevant clip frames.
- **Uncertain / needs review:** insufficient visibility, occlusion, conflicting evidence, unavailable media, or evaluator uncertainty.

Every item contains severity, type, character/scene/clip IDs, short explanation, expected versus observed values if known, evidence timecodes/thumbnails, confidence or confidence band, and a recommended user action. Users may mark a finding `Accepted intentional change`, `False positive`, or `Needs correction`; corrections modify the script/reference only after user confirmation. Reports are versioned and become stale when any checked input changes.

## 5. Data model

All records are project-owned and carry stable UUIDs. Use ISO-8601 UTC timestamps, `schemaVersion`, and monotonically increasing revision numbers. Firestore stores bounded metadata only; do not put image/video/audio binaries or base64 media in Firestore.

### 5.1 Project metadata

`users/{uid}/projects/{projectId}` (existing project document; evolve compatibly):

```json
{
  "schemaVersion": 2,
  "title": "Rooftop Garden",
  "revision": 12,
  "updatedAt": "server timestamp",
  "continuity": {
    "enabled": true,
    "scriptRevision": 4,
    "lastReportId": "report-uuid"
  }
}
```

Existing project editor settings must remain readable. New fields are additive; use migration/defaulting code so older editor documents remain valid.

### 5.2 Character

`users/{uid}/projects/{projectId}/characters/{characterId}`:

```json
{
  "schemaVersion": 1,
  "id": "character-uuid",
  "name": "Nia",
  "aliases": ["the gardener"],
  "role": "protagonist",
  "canonicalDescription": "A fictional rooftop gardener who notices a luminous leaf.",
  "appearance": {
    "ageDescription": "adult",
    "hair": "short coiled black hair",
    "skinTone": "warm brown (user supplied)",
    "build": "slender silhouette",
    "signatureItems": ["green work jacket", "brass watering can"],
    "distinctiveDetails": ["small crescent-shaped fictional scar above left eyebrow"]
  },
  "mustKeep": ["short coiled black hair", "brass watering can unless scene says otherwise"],
  "mayVary": ["jacket may be wet after the storm"],
  "voiceNotes": null,
  "referenceAssetIds": ["asset-uuid"],
  "revision": 3,
  "archived": false,
  "createdAt": "server timestamp",
  "updatedAt": "server timestamp"
}
```

This is user-authored fictional production metadata. The application must not infer or persist a real person's identity from a reference image. `voiceNotes` is optional plain text, never a voice sample, voiceprint, or cloning control.

### 5.3 Reference asset metadata

`users/{uid}/projects/{projectId}/assets/{assetId}`:

```json
{
  "schemaVersion": 1,
  "id": "asset-uuid",
  "kind": "character-reference",
  "mediaType": "image/jpeg",
  "sizeBytes": 842113,
  "width": 1024,
  "height": 1024,
  "sha256": "hex-digest",
  "storageMode": "device-only",
  "storageKey": "opaque-local-id",
  "remoteObjectKey": null,
  "ownerCharacterId": "character-uuid",
  "consent": {
    "remoteAnalysis": false,
    "confirmedAt": null,
    "providerId": null
  },
  "createdAt": "server timestamp"
}
```

`storageKey` is opaque and never a user path. For `device-only`, binary bytes live in IndexedDB and metadata clearly signals that another device cannot fetch them. A remote storage mode is unavailable until configured and opt-in is recorded. Generate remote object keys server-side; use per-user/project namespaces and short-lived signed URLs or server-mediated reads. No public objects.

### 5.4 Scene and clip

`.../scenes/{sceneId}`:

```json
{
  "schemaVersion": 1,
  "id": "scene-uuid",
  "order": 1,
  "title": "The greenhouse door",
  "summary": "Nia discovers the glowing leaf.",
  "locationId": "roof-garden",
  "timeMarker": "night, immediately after the storm",
  "characterStates": [{
    "characterId": "character-uuid",
    "present": true,
    "appearanceVariant": "default",
    "costume": ["wet green work jacket"],
    "startState": ["carrying brass watering can"],
    "endState": ["holds the luminous leaf in left hand"],
    "intentionalChanges": []
  }],
  "props": [{"id":"leaf","state":"glowing","owner":"character-uuid"}],
  "transitionFromPrevious": "Nia enters from the stairwell; the watering can remains with her.",
  "revision": 2
}
```

`.../clips/{clipId}`:

```json
{
  "schemaVersion": 1,
  "id": "clip-uuid",
  "sceneIds": ["scene-uuid"],
  "sequenceOrder": 1,
  "assetId": "asset-uuid",
  "expectedCharacterIds": ["character-uuid"],
  "intentionalVariationIds": [],
  "generation": {
    "providerId": null,
    "modelId": null,
    "modelVersion": null,
    "promptRevision": null,
    "seed": null,
    "referenceAssetIds": [],
    "status": "imported"
  },
  "revision": 1
}
```

The generation record remains nullable for imported/user-created clips and must not claim a model/seed/reference that was not used. Provider-specific seed/reproducibility fields are optional and displayed only when available.

### 5.5 Consistency report

`.../continuityReports/{reportId}`:

```json
{
  "schemaVersion": 1,
  "id": "report-uuid",
  "scope": {"sceneIds": ["..."], "clipIds": ["..."]},
  "inputRevisions": {"script": 4, "characters": {"character-uuid": 3}, "clips": {"clip-uuid": 1}},
  "status": "complete",
  "checks": [{
    "checkId": "check-uuid",
    "category": "visual.appearance.hair",
    "severity": "review",
    "characterId": "character-uuid",
    "sceneId": "scene-uuid",
    "clipId": "clip-uuid",
    "expected": "short coiled black hair",
    "observed": "hair partly occluded; appearance unclear",
    "evidence": [{"assetId":"clip-asset","timeSeconds":2.4,"frameDigest":"..."}],
    "confidence": 0.43,
    "state": "needs-review",
    "explanation": "The sampled frame does not show enough detail to determine a match."
  }],
  "engine": {"kind": "deterministic|multimodal", "providerId": null, "modelId": null, "modelVersion": null, "rubricVersion": "1.0"},
  "createdAt": "server timestamp"
}
```

Do not persist raw sampled frames or face embeddings in a report. Store only minimum findings and bounded evidence pointers/digests. A report is stale if any input revision or asset digest changes.

## 6. Consistency engine

### 6.1 Script-level checks

Implement deterministic validators first; they require no image/video provider:

- Every referenced character, scene, prop, location, and clip ID exists and belongs to the same project.
- Scene order is unique and valid; the scene graph has no unintended cycles.
- A character marked absent cannot also have a required scene state or dialogue in that scene.
- Must-keep attributes remain unchanged unless an explicit variant or transition permits change.
- Prop ownership/location and costume state persist between adjacent scenes unless a declared event changes them.
- Start/end states connect across transitions; unresolved facts are reported rather than silently invented.
- Clip mappings point to valid scenes and the sequence order is explicit.

An optional LLM script reviewer may flag semantic contradictions that rules cannot resolve. It must receive only the selected bounded script/character metadata; return schema-constrained findings with exact scene/character references and quoted evidence. Treat model output as untrusted, validate all IDs and lengths, and present it as advisory. The reviewer may not silently rewrite project content.

### 6.2 Visual clip-level checks

This requires a separately verified vision-capable provider or an explicitly supported local model. Provider adapter contract:

```text
analyzeFrames({ frames, referenceImages, characterSpecs, rubric, deadline })
  -> { provider, model, modelVersion?, findings[], usage?, warnings[] }
```

- Input must be limited to the user-selected clip(s), approved character reference(s), and minimum scene context.
- Sample a bounded number of frames per clip (initial proposal: up to 6 evenly distributed frames plus user-selected frames; configure by clip duration and provider limits). Avoid decoding or uploading full-resolution video if frame sampling suffices.
- Use exact scene-to-character assignment to avoid comparing an absent character.
- Assess observable production attributes (hair/clothing/accessories/color/silhouette/prop continuity), shot visibility, and intentional variations. Do not issue real-person identity matches or use face recognition.
- Return separate per-attribute findings, not a single opaque “same character” score. A low-confidence or occluded result is `uncertain`, never a failure/pass.
- Compare each clip to the selected reference and, when requested, adjacent clips to find visible mismatches. Distinguish appearance mismatch from continuity-state mismatch (e.g., prop disappears) and from image-quality limitations.
- When an evaluator cannot inspect image/video input, is unavailable, times out, or lacks permission, return an explicit `not-run`/`unavailable` result. Never substitute text-only reasoning and label it visual analysis.

If an embedding-based comparison is considered later, it must be separately privacy-reviewed and benchmarked. Do not create or retain facial identity embeddings. An aggregate similarity score must not replace attribute-level evidence or user review.

### 6.3 Scoring and thresholds

Use ordinal outcomes initially: `consistent`, `possible-mismatch`, `mismatch`, `uncertain`, `not-evaluated`. If a provider emits numeric confidence, label it as model confidence, not calibrated probability, unless calibration evidence supports probability language. Version the rubric and thresholds. Before enabling automatic labels, benchmark against a human-reviewed, rights-cleared dataset containing intentional variations, occlusion, lighting/angle differences, and known continuity errors. Record precision/recall by attribute and subgroup where ethically/legal review permits. Keep thresholds configurable server-side, and do not use a single score as an absolute acceptance gate in the first release.

## 7. API and data access

### 7.1 Authentication and authorization

All mutating operations require a valid Firebase ID token. Continue verifying the token and derive `uid` from verified claims; never accept caller-supplied `uid` as authority. Enforce project ownership on every lookup. Firestore client rules must deny cross-user reads/writes, including nested collections. The existing generic user project rule does not automatically secure subcollections; add explicit rules and tests for characters, assets, scenes, clips, reports, and any job documents.

Preferred initial path: use Firebase client SDK to read/write bounded metadata under user-scoped Firestore rules, matching the current `firebase.js` pattern. Route visual analysis/generation through the authenticated Node API. If server-side database writes are introduced, use a least-privilege service identity with server-side project ownership checks, not a client-provided UID. Avoid storing analysis job state only in process memory because the current server's rate-limit and active-job maps are ephemeral.

### 7.2 Proposed routes

All paths below are proposals; preserve existing `/api/ai/run` and `/api/story/generate` contracts.

- `POST /api/projects/:projectId/continuity/script-check` — deterministic and optionally semantic script review. Body includes `scriptRevision`, `sceneIds`, and `checkOptions`; no media bytes.
- `POST /api/projects/:projectId/continuity/clip-check` — explicit opt-in visual review. Body identifies clip/asset IDs, selected character references, and accepted provider/transfer settings; server resolves authorized media rather than trusting arbitrary URLs.
- `GET /api/projects/:projectId/continuity/jobs/:jobId` — retrieve bounded job/report status if analysis is asynchronous.
- Optional `POST /api/projects/:projectId/assets/upload-intent` and completion route — only after approved remote object storage is configured; enforce signed-in user, exact MIME allowlist, size cap, checksum, expiry, and per-user quota.

Use idempotency keys for analysis jobs, bounded request/response schemas, timeouts, per-user concurrency/rate caps, safe error messages, and audit metadata. Do not accept arbitrary URLs, filesystem paths, data URLs, or user-supplied provider endpoints for reference media.

### 7.3 Firestore rules and migrations

Add narrowly matched paths, for example:

```text
match /users/{userId}/projects/{projectId}/characters/{characterId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```

Repeat/adapt for each permitted subcollection, applying field/size validation where practical. Do not broaden the catch-all deny. Confirm existing editor doc reads/writes and tasks continue to work. Since Firestore cannot change the account's database region after creation, keep the existing database and document deployment requirements; do not imply a new region is possible. Firestore's lack of configured Storage or billing must not be worked around by silently uploading images elsewhere.

On app initialization, read missing `schemaVersion` as legacy version 1 and migrate in memory or via explicit safe migration. Avoid destructive batch conversion. Back up/export project metadata before migrations; provide rollback and keep unknown fields when saving so concurrent/newer app versions are not erased.

## 8. Media persistence, privacy, and security

### Default: device-only references

Use IndexedDB for local reference binaries with a versioned object store (`character-assets`) and metadata index. Local refs survive ordinary reloads on that browser profile but do not sync to a second device and may be lost if site storage is cleared. The UI must say so. Revoke object URLs on deletion/unmount, validate file type by content where feasible, enforce a size cap, and handle quota/eviction errors without losing metadata silently.

### Optional cloud sync

Support cloud media only after the user enables it and selects an available, verified storage configuration. Firebase Storage is not assumed active merely because a `storageBucket` appears in client config. If unavailable, say cloud sync is unavailable and retain the local asset. Never place media in Firestore. Use private per-user/project object paths, short-lived authorization, strict file/size limits, encryption in transit and at rest via provider defaults, deletion propagation, and explicit retention disclosure.

### AI transfer consent

Before visual analysis, show which reference and clip frames will leave the device, the configured provider/model, purpose, expected retention/deletion details if known, estimated usage/cost if applicable, and whether the provider uses inputs for training (only claim verified information). Require an affirmative per-project or per-run setting; default off. A video generation request using character references requires its own explicit confirmation because that is a separate transfer/use. Avoid sending unrelated audio, metadata, or other project clips.

Use HTTPS; do not log media, prompts containing private details, ID tokens, signed URLs, or raw provider responses. Redact request logging and configure short retention for diagnostics. Provide Delete character/reference/project controls and clear what deletion can and cannot remove from external provider logs/retention. Do not claim immediate provider-side deletion unless verified.

## 9. Client architecture

- `firebase.js`: add user-scoped CRUD helpers for character/scene/clip/report metadata, with strict data normalization, revision handling, auth-generation guards, and auth-change cleanup. Preserve existing `FrameforgeFirebase` surface compatibly.
- New `character-store.js`: IndexedDB binary storage, metadata lookup, local asset availability, digesting, and deletion.
- New `continuity.js`: form validation, ordered scene graph, deterministic checks, request construction, job polling, report stale detection, and report rendering.
- `editor.js`: keep editing/render/export concerns; add clip/scene mapping only when sequential timeline support is designed. Do not overload its current `video-overlay` layers as generated clip sequences.
- UI modules: character library, character editor, scene planner, clip mapping, report panel, and consent/status dialogs. All generated text and provider output inserted as text nodes, not raw HTML.

Use progressive enhancement and keep existing task/story workflows available if character features fail. Support keyboard access, labels, visible focus, captions/alt text for reference images, reduced motion, and responsive layouts.

## 10. Reliability, limits, and failure behavior

- Every saved object has a revision; use optimistic concurrency or Firestore transaction semantics to prevent stale edits silently overwriting newer work.
- Every analysis is bound to exact input revisions and asset digests. If inputs change during execution, mark the result stale rather than applying it as current.
- Persist job state if checks can outlive an HTTP request. Suggested states: `queued`, `running`, `complete`, `partial`, `failed`, `cancelled`, `expired`.
- Retry transient errors with bounded exponential backoff and idempotency; do not retry a paid provider action without confirming provider semantics/charges.
- Keep a deterministic check usable if the multimodal provider fails. Show partial results accurately.
- Enforce configurable caps for characters, scenes, references per character, reference byte size, clip size/duration, sampled frames, report size, requests/minute, and concurrent jobs. Proposed initial defaults (subject to provider/privacy review): 50 characters/project, 100 scenes/project, 5 reference images/character, 10 MB/reference image, 3 clips/check, 6 sampled frames/clip, 1 visual analysis job/user at a time. Reject before upload where possible and document limits in UI.
- Respect provider-specific constraints, usage limits, and cost disclosures; provider-specific capabilities cannot be assumed from this specification.

## 11. Observability

Log only operational metadata: request/job ID, hashed or internal user ID, project ID, check type, model/provider version, duration, status, bounded error code, and usage metadata. Do not log frames, reference images, full scripts, prompts, facial features, secrets, or signed links. Add metrics for job success/failure, latency, stale-result rate, upload failure, local storage quota errors, and report disposition. Use access controls and retention limits for logs.

## 12. Verification and acceptance criteria

### Functional

1. A user creates a character with two reference images; it persists after refresh and is shown as `This device only` unless cloud sync was explicitly configured.
2. Another signed-in user cannot list, read, update, or delete that character, asset metadata, scene, clip, report, or job by changing IDs.
3. Signing out clears user-scoped in-memory state and unsubscribes listeners; signing in as another user does not flash or retain the prior user's data.
4. A structured script with stable character IDs can be edited, ordered, persisted, and reopened without changing the existing three-draft story generator behavior.
5. Deterministic test fixtures detect an undeclared costume/prop/state contradiction and do not flag a change declared as intentional.
6. A visual report is created only after explicit opt-in and only for selected clips/references. It shows evidence timecodes, uncertain cases, evaluator/model metadata, and freshness status.
7. Provider/network failure, unavailable local media, consent denial, and stale revisions produce truthful states without claiming checks occurred.
8. Deleting a character warns on scene/clip references and never silently deletes unrelated project data. Deleting a reference updates local metadata and configured remote media according to its provider's confirmed deletion behavior.
9. Existing tasks, story drafts, editor projects, local media attachments, filters, layers, and export continue to function.

### Security and privacy

- Firestore emulator tests cover same-user allow and cross-user deny for every document path, including nested collections and catch-all deny.
- API tests cover missing/expired/invalid token, project IDOR, oversized body, wrong MIME, arbitrary remote URL, rate limit, concurrency, replay/idempotency, and safe errors.
- Static analysis confirms no API keys, provider secrets, signed URLs, raw reference images, or ID tokens are embedded in client bundles/logs.
- User consent is absent by default and cannot be overridden by a caller without a verified auth context.

### Quality benchmark

Before presenting visual checks as generally reliable, evaluate a rights-cleared fixture set with same-character clips and controlled changes (hair, costume, accessory, lighting, camera angle, occlusion, declared disguise). Have at least two human reviewers label expected outcomes. Report per-attribute precision/recall, uncertainty rate, and failure examples. Set release thresholds after evaluation; do not market a universal accuracy percentage without reproducible evidence. Early release should be labeled beta/advisory and require human review.

## 13. Rollout plan

**Phase 0 — Design and provider gate:** Decide supported media storage, visual-analysis provider, data residency/retention/terms, cost, and whether generation is in scope. Document exact payloads and consent copy. No provider calls until approved.

**Phase 1 — Structured continuity foundation:** Add schema/versioning, user-scoped character/scene/clip metadata, local IndexedDB reference images, character library, scene planning, deterministic continuity checks, and test fixtures. No video generation or remote vision analysis.

**Phase 2 — Optional secure media sync:** Add configured private object storage only if the user/provider setup is verified. Implement explicit opt-in, quota limits, deletion behavior, and cross-device status.

**Phase 3 — Visual consistency beta:** Add a provider adapter, bounded frame sampler, explicit per-run consent, job persistence, evidence-based reports, uncertainty handling, and benchmark-gated rollout. Keep opt-in and advisory.

**Phase 4 — Generation integration and sequential editing (separate scope):** Select and verify a video provider; add character-reference conditioning only if officially supported; build sequential clip timeline, trims, transitions, audio policy, prompt/revision capture, and generation cost/limits. Run a controlled continuity benchmark across generated clips. Do not couple this phase to editor video-overlay behavior without an explicit migration.

## 14. Open decisions before implementation

1. Is the immediate product goal only to check imported clips, or also generate clips inside Frameforge?
2. Which private storage provider is available, and can users enable it without forcing billing or silently uploading media?
3. Which verified multimodal evaluator can inspect sampled frames, in which regions, with what retention/training terms and cost?
4. Should references be project-only, or reusable across a user's projects? Project-only is the privacy-safe default; cross-project reuse needs explicit copy/permission semantics.
5. What clip sequence/timeline design will represent independent clips and transitions without abusing overlay layers?
6. What maximum media sizes/durations and per-user quotas are acceptable?
7. Which human-reviewed benchmark and release thresholds are required before labeling an automated visual result `consistent` or `mismatch`?

## 15. Release rule

Do not describe Frameforge as having persistent character references, visual cross-clip checks, or AI video continuity until the corresponding phase is implemented, secured, tested, and enabled with a verified provider. Separate three user-visible states: **script checks available**, **visual analysis unavailable/not configured**, and **video generation unavailable/not configured**. This avoids conflating story drafting, stock-media search, local editing, and generative video.
