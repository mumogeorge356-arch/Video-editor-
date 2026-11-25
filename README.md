# Frameforge — browser video prototype

Frameforge is a lightweight, static video-making website. Enter a scene description (or choose an example), select a duration and aspect ratio, and render a short animated video directly in your browser. The result downloads as WebM.

## Run it

Open `index.html` in a recent Chrome, Edge, or Firefox browser. If your browser restricts local-file recording, serve the repository with any static web server, for example:

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## What it does today

This first version uses the prompt to seed a procedural, cinematic animated scene and overlays the prompt as a title. It uses Canvas and MediaRecorder, so it requires no backend, account, API key, or paid generation service. It is a working visual prototype, not an AI text-to-video model: the prompt does not generate literal objects or photorealistic footage.

## Connecting real AI video generation

To generate model-created footage, connect a video-generation provider through a server-side API. Keep provider credentials on the server, submit the prompt from the site to a backend endpoint, then return a job ID and poll for the completed video. Do not put secret API keys in browser code.
