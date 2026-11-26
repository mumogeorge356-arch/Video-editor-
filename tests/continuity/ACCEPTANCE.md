# Cross-Clip Visual Consistency — Acceptance Tests

**Status:** Proposed test suite for a future implementation.  
**Related spec:** [`CHARACTER-CONTINUITY-SPEC.md`](../../CHARACTER-CONTINUITY-SPEC.md), sections 5.5, 6.2–6.3, 7–8, 12.  
**Fixture:** [`visual-consistency-mock-fixtures.json`](fixtures/visual-consistency-mock-fixtures.json).  

## Test harness contract

Run these tests against the future consistency service with injectable fakes for authentication, project storage, local/remote media resolution, job persistence, and `analyzeFrames`. Use **only synthetic metadata and canned evaluator results** from the fixture. The fixture contains no images, video, real people, provider credentials, network destinations, or real provider calls. Do not turn its `mockObservations` into a claim that a visual evaluator actually inspected pixels.

Tests should assert both the report outcome and the side effects: selected assets only, provider call count, no remote call without consent, bounded findings, correct ownership checks, and report freshness. The visual evaluator is a fake in all cases here. Use a separate human-reviewed benchmark before evaluating any real provider's quality.

### Proposed normalized report vocabulary

- `status`: `complete`, `partial`, `failed`, `blocked`, or `stale`.
- finding `state`: `consistent`, `possible-mismatch`, `mismatch`, `uncertain`, or `not-evaluated`.
- finding `severity`: `info`, `review`, or `blocking`.
- Missing evidence or weak visibility must result in `uncertain`/`not-evaluated`, not an assumed match or mismatch.

These are acceptance-contract values proposed for implementation, not claims about the current Frameforge app.

## Functional acceptance cases

| Case | Scenario | Expected result |
|---|---|---|
| VIS-001 | Baseline: same explicit fictional character appears consistently in two selected clips. | `complete`; per-attribute results are `consistent`; evidence points to selected clip IDs and valid timecodes; no global identity claim. |
| VIS-002 | Required invariant (hair) visibly differs in a clip. | `complete`; a hair finding is `mismatch` or `possible-mismatch` according to configured threshold, with expected/observed values and evidence timecode. Do not collapse it to an opaque whole-person score. |
| VIS-003 | Costume changes to a predeclared allowed wet-jacket variant. | No costume mismatch; result records the allowed variation or returns `consistent`. |
| VIS-004 | Costume changes without a declared variant or transition. | Report costume `possible-mismatch`/`mismatch`, including the scene/clip and frame evidence. Do not silently rewrite the character record. |
| VIS-005 | Hair/accessory is occluded or too small to assess. | Attribute result is `uncertain`; explain visibility limitation; do not mark it `consistent` merely because no contradiction was found. |
| VIS-006 | Character is explicitly absent from a selected scene/clip. | Skip that character for that scene. No false missing-character mismatch and no claim that the absent character was visually checked. |
| VIS-007 | Prop state is continuous at the end of clip 1 and start of clip 2, then disappears without a scripted transition. | Report a `visual.continuity.prop_state` or equivalent review finding across the clip boundary with both clip/time references. If the timeline state says the prop was intentionally dropped, do not flag it. |
| VIS-008 | Same appearance under changed lighting, camera angle, or partial occlusion. | No confident mismatch based solely on color/lighting drift; use `consistent` only when evidence supports it, otherwise `uncertain`. Include a reason. |
| VIS-009 | User has not granted remote-analysis consent. | `blocked`; evaluator/provider call count is zero; no frames/reference images leave local storage; UI explains how to opt in. |
| VIS-010 | Reference or clip binary is missing on this device and not synced. | `blocked` or `partial` with the missing asset marked `not-evaluated`; zero provider calls for unavailable bytes; do not use unrelated files or arbitrary URLs. |
| VIS-011 | A checked asset/script/character revision changes while the job is running. | Final result is `stale` or marked stale; input revisions/digests are retained in report metadata; stale result cannot update the current project state as fresh. |
| VIS-012 | Evaluator times out after returning one of two clip results. | `partial` if valid partial findings exist, otherwise `failed`; missing clip gets `not-evaluated`; no fabricated result; retry is bounded and idempotent. |
| VIS-013 | Scene references an unknown character or clip maps to an unknown scene. | Structural validation fails before evaluator invocation; return a safe, actionable error; provider call count zero. |
| VIS-014 | Evaluator emits invalid character/clip IDs, oversized text, extra properties, or markup. | Reject/sanitize invalid output; never render raw HTML; mark affected check failed/uncertain; logs exclude raw media and secrets. |
| SEC-001 | User A requests a project, character, reference, clip, report, or job owned by User B by swapping IDs. | Deny (401/403/404 per API policy); no metadata or asset bytes disclosed; evaluator call count zero. UID in request body is ignored; verified token UID controls access. |
| SEC-002 | Request references an arbitrary URL/path, unsupported MIME, excessive size/frame count, or expired upload handle. | Reject before media retrieval/provider invocation; no server-side fetch to attacker-controlled destinations. |
| SEC-003 | Sign out during analysis, then sign in as a different user. | Old listeners/jobs/UI state are detached or scoped; the new user sees no prior user's character/reference/report data. |
| UX-001 | User accepts a mismatch as an intentional change or marks it false positive. | The finding disposition is stored against that report/input revision; character/script data remains unchanged unless the user separately confirms an edit. |
| UX-002 | Any checked input changes after report creation. | Report is visibly stale and cannot be represented as current; rerun is an explicit user action. |

## Detailed scenario assertions

### VIS-001 — Baseline reference match

1. Load fixture project `project_rooftop_demo`, reference `asset_ref_nia_front`, scenes `scene_roof_night` and `scene_roof_after_rain`, and clips `clip_roof_a` and `clip_roof_b`.
2. Enable consent for the fake provider and make all requested assets available.
3. Inject the canned `VIS-001` provider response.
4. Assert exactly the selected reference and two selected clips are passed to the adapter; unrelated project assets are not.
5. Assert the report includes per-attribute findings, the mock provider/model/rubric versions, input revisions, and valid evidence timecodes.
6. Assert no field or UI label calls this face/identity verification or guarantees character identity.

### VIS-005 — Occlusion and uncertainty

1. Inject a low-visibility hair observation and a visible clothing observation.
2. Assert hair is `uncertain` with an occlusion explanation while clothing can be assessed independently.
3. Assert no overall `consistent` result masks the uncertain hair dimension; do not convert missing evidence to confidence 1.0 or a mismatch.

### VIS-007 — Cross-clip prop state

1. Clip A's last relevant frame shows the brass watering can in Nia's hand; clip B's first relevant frame does not show it.
2. The scene state says Nia still carries the can and contains no drop/transfer event.
3. Assert a boundary finding links both clip IDs and timecodes, and names the expected continuity state.
4. Repeat with an explicit `intentionalChanges` event (`can placed by stairwell`); assert the finding is suppressed or marked resolved/intentional.

### VIS-009 — Consent gate

1. Keep local assets available but set consent `remoteAnalysis: false`.
2. Invoke visual check.
3. Assert the job is blocked before `analyzeFrames`, provider usage accounting, upload-intent creation, or network transfer. Assert report/UI states that no visual analysis was run.

### VIS-011 — Stale revision race

1. Start a job against character revision 3 and clip digest A.
2. Before the adapter resolves, update the character to revision 4 or replace the clip with digest B.
3. Resolve the mock adapter.
4. Assert the result cannot be attached as a fresh report; status is stale (or completed-but-stale under the chosen persistence design) and records the original revisions/digests.

### SEC-001 — Cross-user isolation

1. Create identical-looking fixture IDs under `user_demo_a` and `user_demo_b` with different content.
2. Authenticate as A and request B's resource by ID.
3. Assert denial with no existence/content side channel beyond the documented status policy. Assert zero media reads and zero evaluator calls.
4. Repeat for a nested asset and report/job ID; test Firestore rules and API ownership checks independently.

## Release gate

The suite passes only when all mandatory functional and security cases pass against the implementation and the provider is replaced by the fake in tests. A passing mock suite verifies control flow, schema handling, permission boundaries, and report UX; it **does not establish real visual accuracy**. Provider enablement requires a separate rights-cleared, human-reviewed quality benchmark and verified privacy/cost/retention terms. Until a provider is implemented, visual tests should return `unavailable` in production rather than attempting mock or text-only analysis.
