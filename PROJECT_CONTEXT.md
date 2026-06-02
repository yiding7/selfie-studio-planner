# Project Context

This file is a quick handoff note for Codex and other AI coding agents. Keep it current with every meaningful commit.

## Product Goal

Selfie Studio Planner is a small web app for low-budget, non-professional photo shoot planning. Users choose a subject type and provide a theme prompt or use an I'm Feeling Lucky flow. The app returns a practical shoot plan with visual direction, clothing, props, scenes, lighting, posing, composition, post-processing, shopping, shot lists, and grouped image references.

## Target Scope

The tool is for beginners using phones, phone remotes, entry-level mirrorless cameras, simple lights, low-cost props, paper backdrops, ordinary homes, and accessible public locations. It is not intended for professional photographers or production teams.

## Architecture Boundary

- The frontend is English.
- Code-facing strings, schema fields, and the system prompt are English. Generated plan content follows a backend-detected required output language: Chinese prompts produce Simplified Chinese, English prompts produce English, and lucky/no-prompt generation defaults to English. JSON field names remain English.
- README is bilingual, English first, with a manually expandable Chinese section for GitHub rendering.
- The LLM generates the plan, referenceIntent, grouped searchQueries, and screeningRules.
- The LLM must not browse for images and must not return image URLs.
- Image search uses Brave Search API only.
- The backend owns query expansion, Brave image search, rule scoring, dedupe, lightweight subject matching, and grouped top-image assignment.
- The frontend renders the final plan, grouped image references, source links, image modal, PNG export, and PDF export.

## Image Pipeline

```text
referenceIntent -> query generation -> Brave image search -> rule scoring -> grouped top images
```

Image groups:

- Final Visual References
- Clothing References
- Prop References
- Scene References

## Supported APIs

LLM providers:

- ZenMux
- OpenAI
- Gemini through Google's OpenAI-compatible endpoint
- Anthropic Claude Messages API
- Generic OpenAI-compatible chat/responses providers

Image provider:

- Brave Search API only

Removed or intentionally unsupported:

- LLM web/image search image retrieval
- Vertex AI Search
- Google Custom Search JSON API
- SerpAPI Google Images
- Bing Image Search
- Wikimedia Commons fallback

## Configuration And Security Rules

- `.env` is not committed.
- Backend reads API keys from environment variables.
- Frontend never receives API keys.
- Missing LLM API disables generation.
- Missing Brave Search API disables Image Search but still allows text-only generation.
- The app is local-first. With `HOST=127.0.0.1`, no account system, CAPTCHA, public abuse monitoring, or production public rate limiter is required.
- Do not expose the app through a tunnel, reverse proxy, public IP, or hosted URL unless abuse protections are added first.
- If public hosting is revisited, add rate limiting, origin restrictions, request logging, quota alerts, key rotation, and conservative Image Search query limits.

## Main Files

- `server.js`: HTTP server, LLM provider config, system prompt in `buildPrompt()`, Brave image pipeline, image proxy, API routes.
- `public/index.html`: static app shell.
- `public/app.js`: frontend state, rendering, image preview, exports.
- `public/styles.css`: UI styling and export layout.
- `.env.example`: supported environment variables.
- `README.md`: public documentation.

## Prompt Customization

The main system prompt lives in:

```text
server.js -> buildPrompt()
```

When changing it, keep the JSON contract stable unless the backend render/scoring code is updated at the same time. Preserve the current language policy unless intentionally changing product behavior: detect prompt language server-side, inject a required output language into the prompt, and keep JSON field names in English. The key contract fields are `referenceGroups`, `searchQueries`, and `screeningRules`.

## Current Export Behavior

PNG captures the generated plan. PDF uses html2pdf.js with `enableLinks: true`; reference image tiles include source links so PDFs can preserve clickable source URLs when supported by the viewer.
