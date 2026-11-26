# Frameforge Studio — implementation and design plan

## Product scope and architecture

Keep the existing three-page Frameforge Studio experience and browser-based editor intact. Hugging Face is excluded. The platform-provided Manus LLM (which consumes project credits) processes signed-in submitted tasks and explicit signed-in story-generation requests. The task assistant may answer a task, search existing Pixabay photos and video clips through the configured API, and retrieve text from public HTTP/HTTPS URLs explicitly supplied in that task. Pixabay is a stock-media source, not a generative service. Return the largest image sizes and video streams actually available in each API result, with Pixabay source links and attribution. Keep API results cached for 24 hours and display image hotlinks only as temporary search results. Keep the task assistant bounded to these fixed actions: no arbitrary browsing, authentication, file/account actions, Firebase writes beyond saving the task response in its existing owner-scoped task record, or external operations. Do not promise AI-generated images or videos through Pixabay.

Preserve Firebase Authentication/Firestore behavior and the local-only media/source-file policy. Add a small dependency-free Node HTTP backend alongside the existing site. The backend serves the current built static files and narrowly scoped `/api/ai/run` and `/api/story/generate` routes. In published hybrid deployment, use a static build for the web files, a container for the Node API, `/api/*` to server, and the static fallback to static output. Preserve the three existing page routes and do not route personalized/generated content through the static target.

Use the existing platform-supplied `MANUS_API_URL`/`MANUS_API_KEY` at runtime for LLM calls and the protected `PIXABAY_API_KEY` at runtime for photo/video search; neither may be returned to the browser or logged. Validate Firebase ID tokens and derive user identity server-side; never accept a caller-supplied UID as identity. Require authentication for task processing and story generation, enforce input/output byte limits, per-user throttles and time budgets, and expose only the fixed Pixabay stock-media search and public-page retrieval tools to task processing. For URL retrieval, allow only explicitly submitted HTTP/HTTPS URLs; reject credentials in URLs, localhost, private/link-local/reserved IP ranges, and redirects; resolve and pin a public destination, restrict response content type/size/time, and do not access links requiring authentication. Do not let the agent run arbitrary code, make arbitrary network calls, modify Firebase records beyond the owner-scoped task response, or perform account/site operations. If secure authentication or retrieval cannot be enforced, fail closed.

On a successful user Send, after saving the task locally, call `/api/ai/run` with that task text and Firebase ID token; return the assistant response and Pixabay photo/video stock matches to the same task view. If signed out or the AI service fails, keep the task saved and show an accurate status. Home also has a separate, explicit Generate story control: with a signed-in Firebase user, send the bounded idea to `/api/story/generate` and display three distinct story drafts, each with a title and story text. Selecting a draft copies it into the task composer for review/editing; it is not automatically saved, submitted, or written to Firestore. Story-generation calls are user-triggered and may consume platform credits. Pass only bounded user text and explicitly included safe public-page excerpts to the task LLM. Pixabay results must preserve valid Pixabay attribution/page links; display video previews and image results only as temporary search-result media, never invent results or describe stock search as generation.

Do not add a generic AI explainer or broad generation-mode panel to Home. The explicitly requested Generate story button is a narrow story-writing feature, separate from task-processing Send: make its AI role visible through the control and draft results, state sign-in and credit use plainly, and provide loading/failure feedback. Keep attachments local and exclude them from story requests. Render returned text as escaped text. Show task-processing/failure state in the relevant task rather than a static banner.

### Feature modules

- `server.js`: static page/assets serving, health check, Firebase ID-token verification, bounded `/api/ai/run` and authenticated `/api/story/generate`, safe public URL retrieval, 24-hour-cached Pixabay photo/video search, LLM tool dispatch, request/time/size limits, and per-user throttling.
- `index.html`, `app.js`, `tasks.html`, `firebase.js`, `app.css`: add a distinct Home Generate story action and accessible result panel for three AI-created story drafts; let users select a draft into the composer without automatically submitting it. Keep the ordinary Send action invoking task processing and show returned text and attributed Pixabay stock photo/video links in the relevant task, preserving existing sync and local media behavior.
- `Dockerfile` and build configuration: dependency-free Node runtime, self-contained static build output, and container entrypoint/health check.
- `manus-routes.json`: retain the three existing page routes; API and health paths are not page routes.
- `plan.md`, `TODO.md`, and `README.md`: document server-backed task processing, story generation, project-credit usage, safe public URL limits, Pixabay attribution, privacy, and Firebase boundaries.

## Design

- **Design Movement:** restrained cinematic editing console, inspired by broadcast control-room hardware softened with Frameforge’s established dark editorial styling.
- **Core Principles:** tools are grouped by intent; media preview remains visually dominant; every active setting has immediate feedback; provider/model limits are stated honestly.
- **Color Philosophy:** near-black graphite makes media the brightest surface, while restrained orchid marks selection and active generation; muted gray separates secondary controls.
- **Layout Paradigm:** preserve the current Home and editor compositions; show task responses inline in the corresponding task card and Home story choices below their input.
- **Signature Elements:** orchid active-task edge; compact labeled controls; unobtrusive response status.
- **Interaction Philosophy:** submit a task for a bounded assistant response, or explicitly ask the signed-in AI to draft three varied stories from an idea; let the user review/edit a draft before sending it. Keep local task saving available when services fail.
- **Animation:** brief 120–180 ms state transitions; no decorative motion during generation/playback; honor reduced-motion preferences.
- **Typography System:** retain DM Sans for controls/body and Space Grotesk for headings; keep labels compact but legible.
- **Brand Essence:** a focused task workspace with a bounded research assistant and creative editor; precise, calm, resourceful.
- **Brand Voice:** direct, useful, and explicit about state. Example lines: “Your task is saved; the assistant is working on it.” “Your story drafts are ready to review.”
- **Wordmark & Logo:** preserve existing Frameforge wordmark and logo metadata.
- **Signature Brand Color:** soft orchid `#b69cff`.

## Project structure

The repository remains flat: `index.html`, `tasks.html`, and `editor.html` remain the three routes; `server.js` implements the Node API and static server; existing `app.js`, `composer.js`, `editor.js`, `app.css`, `firebase.js`, Firestore rules, and `app.config.ts` retain their current responsibilities; `manus-routes.json` remains the page-only route manifest; `README.md` documents operation and boundaries; `TODO.md` records separately deliverable outcomes. Existing `test-pixabay.js` is retained unchanged.

## Constraints

Hugging Face remains excluded. Built-in LLM requests consume Frameforge's platform project credits and are initiated only when the signed-in user sends a task or explicitly presses Generate story. Pixabay search consumes the existing Pixabay account's API quota; retain safe-search and attribution links. URL retrieval is limited to safe public web pages supplied in the task, and may send their bounded excerpts to the platform LLM. Do not upload local attachment binaries to either AI route. Do not alter Firestore rules or claim they were Console-published/verified. Keep actions authenticated and bounded, and do not add unattended/background processing. Do not publish without separate authorization.
