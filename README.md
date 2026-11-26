# Frameforge — local task workspace and video editor
Frameforge is a static browser application with a Home task composer, a focused Tasks page, and a separate Edit Video workspace. The task composer supports local voice recording, photo/video capture, and file attachments. Tasks have In progress and Done states. The editor provides a browser-based timeline/compositor and local WebM/GIF exports.

## Run it

Run the dependency-free Node server from the project root (do not open pages through `file://`; Firebase ES modules require HTTP or HTTPS):

```bash
FRAMEFORGE_STATIC_DIR=. node server.js
```

Then open `http://localhost:3000`.

## Firebase Authentication, Firestore, and local media

The static client is configured for Firebase project `gjoe-video-editor` in [`firebase.js`](firebase.js). Email/Password Authentication must be enabled in Firebase Console, and the deployed site's domain must be permitted under Authentication's authorized domains. The browser client config is intended to be public; it is not a service-account credential. Never place a service-account key or private API secret in this static site.

The app calls `getFirestore(app)` without a database ID, so Firebase uses the project's default `(default)` Firestore database. The project owner reports that database is in `us-central1`; this app does not create, select, or change database locations. Firebase Storage is not used; there is no media upload.

After signing in on Home, task details, status, and attachment metadata sync to `/users/{uid}/tasks/{taskId}`. Editor layer/settings metadata syncs to `/users/{uid}/projects/editor`. Existing browser-local tasks are **not** automatically imported into an account. Older story/project drafts may be migrated locally into the In progress list, but that migration does not upload them. Only the signed-in user's UID path is addressed. When unauthenticated or Firestore is unavailable, local task persistence remains available. Sign-in uses Firebase's persisted browser session; sign-out is on Home.

Binary task attachments remain in this browser's IndexedDB. Video, image, and audio source files in the editor are temporary object URLs; they are not saved to Firestore or uploaded. Firestore stores only task text/status, attachment names/types/sizes/IDs, and editor settings/layer metadata. Cloud editor metadata cannot bring media binaries to another browser: reselect source media there. Local display-name preferences remain in this browser.

### Publish the Firestore rules

[`firestore.rules`](firestore.rules) allows task and project reads/writes only to an authenticated user whose UID matches `{userId}`, then denies all other document paths. To apply it, open Firebase Console for `gjoe-video-editor`, choose **Firestore Database → Rules**, replace the editor contents with the complete `firestore.rules` file, and click **Publish**. Confirm the app's `(default)` database is the target. Do not broaden the rules to `allow read, write: if true`.

**Console status:** The project owner reports the default database exists in `us-central1`. The rules file is present in the repository, but Firebase Console access was blocked by Google's account-recovery page during this task, so the live database configuration, deployed rules, and authenticated read/write behavior could not be verified. Treat cloud sync as pending until the rules are published and tested.

### Manual smoke check after rule publication

1. Serve the site over localhost/HTTPS, create a test account from Home, and submit a text task. Confirm it appears on Tasks and in Firestore under that test user's UID.
2. Mark it Done, reopen it, and delete it; check each change in Firestore.
3. Sign out and sign in again as the same user; confirm the task list returns. Test a different account and verify it sees only its own records.
4. Attach a small file and confirm its metadata syncs while the binary remains only in the originating browser's IndexedDB. Do not expect it on a second device.
5. Change an editor setting while signed in, reload Edit Video, and confirm the metadata restores. Imported media itself must be reselected.
6. With rules unavailable or the network disconnected, confirm the app reports the cloud error and local task operations remain available.

## Local editor and media limits

The editor uses the browser's native media decoder, Canvas, `MediaRecorder`, and an in-page GIF encoder. Add a video, then use Add media for additional video overlays, images, or audio. Layer and adjustment settings are saved in local storage and, while signed in, sync to Firestore. Imported source binaries are temporary object URLs and are never uploaded, so reselect media after reloading. This is a compact browser-based compositor rather than a full nonlinear multitrack editor: the primary clip sets the timeline duration, secondary video overlays follow its playhead, and groups are named overlay-stack labels rather than nested group transforms. Masks are circular/rounded crops or clips to the primary-footage bounds. WebM export requires a supported browser encoder and media capture. Source-audio capture depends on browser support; a separate audio source is available for preview, but mixed-audio capture is not guaranteed across browsers. GIF export is silent, limited to eight seconds at 320 × 180 and 12 frames per second, with a 256-colour palette. Browser codec, file size, memory, and CPU constraints apply.

Microphone recording requires permission and works on HTTPS or localhost.

## AI task processing and Pixabay

After a signed-in user sends a text task, Frameforge saves the task locally and then sends its text to the built-in Manus LLM using the project's platform credits. The assistant may answer the request, search existing Pixabay photos or video clips through the configured Pixabay API, and retrieve bounded text from up to three public HTTP/HTTPS links included in the task. It chooses the largest image size and video stream returned by the API (full-resolution image URLs are only present for accounts approved for full API access). Pixabay supplies stock media, not AI generation. Results include Pixabay source links and are cached for 24 hours; image hotlinks are only temporary search-result previews. The Pixabay key and Manus service credentials are read only by the server; never copy them into browser code.

Home also provides a separate **Generate story** action. A signed-in user can enter an idea and request three distinct titled drafts from the built-in Manus LLM; each request may consume the project's platform credits. The idea is sent to the authenticated `/api/story/generate` route, which accepts up to 2,000 characters and returns bounded plain-text drafts. Selecting a result only copies it into the composer for review or editing: generating does not create a task, save a story, or write to Firestore. The idea is not persisted by the generation route, and local attachments are not sent. Signing in is required; if generation fails, the idea stays in the composer for retry.

Task AI processing and story generation require Firebase sign-in. If a task's AI call fails, the task remains saved locally and the response describes the status. Attached files remain in IndexedDB and are not sent to either AI route. Public links must resolve to public IPv4 addresses and use standard HTTP/HTTPS ports; redirects, credential-bearing links, sign-in pages, localhost/private addresses, non-text pages, oversized pages, and slow requests are not fetched. Retrieved page text is treated as untrusted input and may be sent to the platform LLM. The task assistant is restricted to Pixabay stock-media search and supplied public-page retrieval; it cannot sign in, execute code, access private resources, or change accounts. Each signed-in task submission and story-generation request may consume platform credits; Pixabay searches use the configured Pixabay account's API quota. Pixabay's [API documentation](https://pixabay.com/api/docs/) covers its image and video search endpoints, media-size fields, attribution, caching and hotlinking rules.

The backend serves static pages, `/api/ai/run`, and `/api/story/generate`. For a production hybrid deployment, build the static output into `dist`, use the root `Dockerfile` for the Node container, route `/api/*` to the server and remaining page/assets to static output, and use `/api/health` as the unauthenticated container health endpoint. The project owner must configure the deployment before the production API is available; local preview uses the Node server directly.

## Google Drive and OneDrive

Cloud file picking is not connected yet. Before adding it, create a Google Cloud Web OAuth client and a browser-restricted API key, enable the Drive API, and register the final site origin. For OneDrive, create a Microsoft Entra single-page app registration, configure the final origin/redirect, and grant delegated file-read permission. The Home page links to each provider's current setup documentation. Do not place provider client secrets or passwords in this static app.

## Pixabay API smoke test

The standalone `test-pixabay.js` script tests the Pixabay image endpoint using a key supplied as an environment variable. Keep the key out of source control:

```bash
PIXABAY_API_KEY="your-key" node test-pixabay.js sunset
```
