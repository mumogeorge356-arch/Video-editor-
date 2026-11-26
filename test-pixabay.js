#!/usr/bin/env node
'use strict';

// Minimal Pixabay API smoke test. Never hard-code or print the API key.
// Usage: PIXABAY_API_KEY="..." node test-pixabay.js [search terms]

const apiKey = process.env.PIXABAY_API_KEY;
if (!apiKey) {
  console.error('Missing PIXABAY_API_KEY. Set it in the environment before running this script.');
  process.exit(2);
}

const query = (process.argv.slice(2).join(' ').trim() || 'sunset').slice(0, 100);
const url = new URL('https://pixabay.com/api/');
url.searchParams.set('key', apiKey);
url.searchParams.set('q', query);
url.searchParams.set('image_type', 'photo');
url.searchParams.set('safesearch', 'true');
url.searchParams.set('per_page', '3');

(async () => {
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });

    console.log(`HTTP ${response.status}`);
    for (const header of ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset']) {
      const value = response.headers.get(header);
      if (value) console.log(`${header}: ${value}`);
    }

    if (!response.ok) {
      // Do not print response URLs or request configuration that could reveal the key.
      if (response.status === 401 || response.status === 403) {
        console.error('Pixabay rejected the key or access. Check the key and account/API access.');
      } else if (response.status === 429) {
        console.error('Pixabay rate limit reached. Wait for the reset window and retry.');
      } else {
        console.error('Pixabay returned an HTTP error. Check the API status and try again.');
      }
      process.exitCode = 1;
      return;
    }

    const data = await response.json();
    if (!data || !Array.isArray(data.hits)) {
      console.error('Pixabay responded, but the payload did not contain an image results list.');
      process.exitCode = 1;
      return;
    }

    console.log(`Pixabay API key accepted; search returned ${data.totalHits ?? data.hits.length} accessible result(s).`);
    for (const hit of data.hits) {
      console.log(`- ${String(hit.tags || 'Untitled').slice(0, 100)} (image ID ${hit.id})`);
    }
  } catch (error) {
    console.error(`Request failed: ${error?.name === 'TimeoutError' ? 'timed out after 15 seconds' : 'network or JSON error'}.`);
    process.exitCode = 1;
  }
})();
