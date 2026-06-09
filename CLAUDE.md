# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run the app (both are equivalent)
npm start
node server.js

# No build step — the server serves static files from public/ directly
```

There is no test suite. No linter config. The app runs as-is once `.env` is configured.

## Architecture

This is a Node.js 20+ ESM app (`"type": "module"`). No framework, no bundler. The server is a hand-rolled HTTP server using `node:http`.

**Request flow for `/api/generate`:**

1. `server.js` → `server/routes.js: handleGenerate()`
2. `callModel()` in `server/llm.js` — sends `buildPrompt()` output to the configured LLM provider, returns a parsed JSON plan object
3. `hydrateReferenceImages()` in `server/image/references.js` — mutates the plan in-place, attaching `images` arrays to each of the four `referenceGroups`
4. Response sent as `{ plan, generatedAt }`

**Image pipeline (`server/image/`):**

- `queries.js` — generates Brave search queries from `referenceGroups[].searchQueries` + subject type; also assigns manual search queries back to reference items
- `provider.js` — calls Brave Search API, normalizes candidates
- `scoring.js` — scores each candidate from metadata only (no vision model); key signals: dimensions, title/URL token match, named-work match, subject-type match
- `references.js` — orchestrates the above, attaches top images per group

**LLM contract (critical):**

- The LLM must return a JSON object matching the schema in `server/prompt.js: buildPrompt()`. JSON field names are always English; user-facing values are in the detected output language (Simplified Chinese or English).
- The four `referenceGroups` titles must stay exactly: `"Final Visual References"`, `"Clothing References"`, `"Prop References"`, `"Scene References"`. These strings are matched by name in `scoring.js`.
- The LLM must not return image URLs — the backend pipeline owns all image retrieval.
- Key fields that backend code depends on: `referenceGroups[].searchQueries`, `referenceGroups[].screeningRules`, `referenceIntent`.

**Frontend (`public/js/`):**

Vanilla JS modules loaded via `<script type="module">` from `public/app.js`. No framework, no bundler.

- `state.js` — single mutable state object
- `generate.js` — calls `/api/generate`, updates state
- `render.js` — renders the plan DOM from state
- `form.js` — subject selector and prompt input behavior
- `modal.js` — full-size image preview
- `export.js` — PNG (html2canvas) and PDF (html2pdf.js) export

**LLM provider selection (`server/llm.js: getProviderConfig()`):**

Priority order: `LLM_API_KEY` → `ZENMUX_API_KEY` → `GEMINI_API_KEY` → `ANTHROPIC_API_KEY` → `OPENAI_API_KEY`. Each provider uses a different wire protocol (`chat`, `anthropic`, `responses`).

## Key Constraints

- Do not ask the LLM to browse for images or return image URLs — the backend owns image retrieval.
- Keep `referenceGroups` titles, `searchQueries`, and `screeningRules` schema stable unless updating `scoring.js` and `references.js` in the same change.
- Image search is Brave only. `BRAVE_SEARCH_API_KEY` missing disables image search but text generation still works.
- The app is local-first (`HOST=127.0.0.1`). Do not add public-facing features without also adding rate limiting.

## Environment Setup

```bash
cp .env.example .env
# edit .env with your API keys
node server.js
```

Open `http://127.0.0.1:5173`. API keys are backend-only and never sent to the frontend.
