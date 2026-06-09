# Selfie Studio Planner

[English](#selfie-studio-planner) | [中文](#中文)

Selfie Studio Planner is a small web app for planning low-budget, non-professional photo shoots. It is designed for beginners using phones, phone remotes, entry-level mirrorless cameras, cheap backdrops, simple props, window light, desk lamps, LED panels, and ordinary home or public locations.

It is **not** a professional photography production tool. It is best for couples, families, friends, and solo users who want practical ideas for anniversary photos, family portraits, themed self-portraits, or small friend-group shoots without using standardized studio templates.

## What It Does

The backend detects the prompt language and injects a required output language into the LLM prompt. Chinese prompts produce Simplified Chinese plans; English prompts produce English plans; the lucky flow defaults to English. JSON field names stay in English.

The app generates:

- A shoot theme and mood direction
- Final visual references
- Clothing references and concrete search terms
- Prop references and era-safety warnings
- Scene references and DIY alternatives
- Lighting and set advice for low-budget spaces
- Expression, pose, and composition guidance
- Beginner-friendly post-processing steps
- Low-cost shopping and must-shoot lists
- PNG and PDF exports, including source links for reference images in PDFs

## Architecture

The generation pipeline runs three sequential stages:

```text
[1] Research Agent  →  backgroundContext (named work, visual style, costume/prop/scene/lighting facts)
        ↓
[2] Plan Agent      →  theme plan, referenceGroups with searchQueries and screeningRules
        ↓
[3] Image Pipeline  →  Brave search → metadata scoring → Vision Reranker (optional) → grouped images
```

**Stage 1 — Research Agent** (`server/research.js`): A dedicated LLM call with a "visual research specialist" role runs before plan generation for any non-lucky prompt. It outputs verified facts about the named work, visual style, costume details, props, scene types, lighting character, pose vocabulary, and color grade direction. The result is injected into the plan prompt and displayed to the user as a collapsible background brief above the plan. The research agent is best-effort: if it fails, the pipeline continues with an empty context.

**Stage 2 — Plan Agent** (`server/llm.js`, `server/prompt.js`): The main plan LLM call receives the background context and is instructed to anchor every section (lighting, poses, costumes, color grade, props, scenes) in the verified facts. It generates the full theme plan with grouped `searchQueries` and `screeningRules` but never returns image URLs.

**Stage 3 — Image Pipeline**: Brave Search fetches candidates for each reference group. A metadata scorer ranks them by dimensions, named-work match, subject-type match, and premium-source bonuses. If the configured LLM provider is Anthropic, a vision reranker (`server/image/reranker.js`) additionally scores up to 12 candidates per group using `claude-haiku-4-5-20251001` for subject match, theme fit, and real-photo confidence. The combined score is 40% metadata + 60% vision. The vision reranker gracefully degrades to metadata-only scoring on timeout, error, or non-Anthropic providers.

Responsibilities:

- **Frontend**: subject selection, prompt input, Image Search toggle, 3-phase loading indicator (Research → Plan → Images), result rendering, collapsible background research brief, per-reference manual image-search query chips, image preview modal, PNG/PDF export.
- **Research Agent**: verifies visual facts before planning so the plan is grounded in accurate period, costume, lighting, and scene details rather than generic suggestions.
- **Plan Agent**: generates theme plan, reference intent, grouped search queries, and screening rules. Does not browse for images and must not return image URLs.
- **Image Search API**: Brave Search API returns candidate images per query.
- **Backend rules**: expand queries from background context search hints, score image quality from returned metadata, filter obvious mismatches, match named works and subject type, dedupe, optionally rerank via vision, and assign top images to the four groups.

Key code modules:

- `server.js`: small HTTP entrypoint and route dispatch.
- `server/research.js`: research prompt, JSON extraction, and `formatBackgroundContext()`.
- `server/prompt.js`: plan system prompt with background context injection and JSON extraction.
- `server/llm.js`: LLM provider configuration, `callResearchAgent()`, `callModel()`, and shared `callLLMText()`.
- `server/routes.js`: orchestrates research → plan → image hydration; returns `backgroundContext` in the API response.
- `server/image-search.js`: compatibility re-export for the image pipeline modules.
- `server/image/provider.js`: Brave provider config, API calls, and image candidate normalization.
- `server/image/queries.js`: subject-aware query generation and per-reference manual query assignment.
- `server/image/scoring.js`: metadata-based image scoring, named-work matching, and subject mismatch penalties.
- `server/image/reranker.js`: Anthropic vision reranker (claude-haiku); gracefully falls back to metadata-only.
- `server/image/references.js`: reference group normalization, image hydration, and reranker orchestration.
- `server/static.js`: static file serving.
- `public/app.js`: tiny frontend module entrypoint.
- `public/js/*.js`: frontend modules for state, form behavior, rendering, modal preview, export, and API generation.

The four image groups are:

- Final Visual References
- Clothing References
- Prop References
- Scene References

## Supported Capabilities

### LLM APIs

The app can use one of these providers through environment variables:

- ZenMux
- OpenAI
- Gemini through Google's OpenAI-compatible endpoint
- Anthropic Claude Messages API
- Generic OpenAI-compatible providers via `LLM_API_KEY`, `LLM_PROTOCOL`, `LLM_BASE_URL`, and `LLM_MODEL`

Provider priority is:

1. `LLM_API_KEY`
2. `ZENMUX_API_KEY`
3. `GEMINI_API_KEY`
4. `ANTHROPIC_API_KEY`
5. `OPENAI_API_KEY`

### Image Search API

The app currently supports **Brave Search API only** for image search.

Removed or intentionally unsupported image routes:

- LLM web/image search
- Vertex AI Search
- Google Custom Search JSON API
- SerpAPI Google Images
- Bing Image Search
- Wikimedia Commons fallback

If `BRAVE_SEARCH_API_KEY` is missing, the frontend disables Image Search. Text planning still works when an LLM API is configured.

## Local Setup

```bash
cp .env.example .env
npm start
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173).

If npm is unavailable:

```bash
node server.js
```

## Environment Configuration

Example ZenMux + Brave configuration:

```bash
ZENMUX_API_KEY=your_zenmux_key
ZENMUX_MODEL=google/gemini-3.1-flash-lite
ZENMUX_BASE_URL=https://zenmux.ai/api/v1

IMAGE_SEARCH_PROVIDER=brave
BRAVE_SEARCH_API_KEY=your_brave_search_key
BRAVE_IMAGE_SEARCH_ENDPOINT=https://api.search.brave.com/res/v1/images/search
BRAVE_SEARCH_COUNTRY=US
BRAVE_SEARCH_LANG=en
BRAVE_SAFESEARCH=strict
BRAVE_SPELLCHECK=1
BRAVE_IMAGE_SEARCH_COUNT=20
BRAVE_IMAGE_SEARCH_TIMEOUT_MS=8000
IMAGE_SEARCH_QUERIES_PER_GROUP=2

PORT=5173
HOST=127.0.0.1
```

Notes:

- API keys are read only by the backend. They are not sent to the frontend.
- `.env` is ignored by git and should not be committed.
- `IMAGE_SEARCH_QUERIES_PER_GROUP=2` limits Brave image requests per reference group. Increase it for more recall, lower it for cost control.
- `BRAVE_IMAGE_SEARCH_COUNT=20` controls candidate images per query before backend ranking.
- `BRAVE_IMAGE_SEARCH_TIMEOUT_MS=8000` controls the per-query Brave request timeout. If Brave times out or candidates are filtered out, the frontend shows a warning and keeps manual image-search queries visible.

OpenAI example:

```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4.1-mini
OPENAI_BASE_URL=https://api.openai.com/v1
```

Gemini example:

```bash
GEMINI_API_KEY=your_gemini_key
GEMINI_MODEL=gemini-2.5-flash
GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
```

Anthropic example:

```bash
ANTHROPIC_API_KEY=your_anthropic_key
ANTHROPIC_MODEL=claude-sonnet-4-5-20250929
ANTHROPIC_BASE_URL=https://api.anthropic.com/v1
```

Generic provider example:

```bash
LLM_API_KEY=your_key
LLM_PROVIDER=zenmux
LLM_PROTOCOL=chat
LLM_MODEL=google/gemini-3.1-flash-lite
LLM_BASE_URL=https://zenmux.ai/api/v1
```

## Customizing The System Prompt

The main prompt contract lives in:

```text
server/prompt.js -> buildPrompt()
```

Edit `server/prompt.js -> buildPrompt()` to adapt the tool to your own workflow, language policy, reference sources, JSON schema, subject-type rules, visual grounding rules, or LLM behavior limits. The current policy detects the prompt language server-side, injects a required output language into the system prompt, and keeps JSON field names stable in English.

Important constraints to preserve unless you intentionally redesign the app:

- Keep the JSON shape stable, especially `referenceGroups`, `searchQueries`, and `screeningRules`.
- Do not ask the LLM to return image URLs. The backend image pipeline owns image retrieval and scoring.
- Keep reference group titles aligned with backend scoring rules in `scoreImageCandidate()`.

## Export

- PNG export captures the generated plan as an image.
- PDF export uses html2pdf.js and keeps source links for reference images when the PDF viewer supports clickable links.

## Local-First Security Notes

The current app is intended to run locally by default. If you keep `HOST=127.0.0.1` and open the app only on your own machine, heavy abuse-prevention features are not necessary:

- No account system is needed.
- No CAPTCHA is needed.
- No public abuse monitoring is needed.
- No production-grade public rate limiter is needed.

You should still keep the basic safety rules:

- Never commit `.env` or API keys.
- Keep `HOST=127.0.0.1` for local use.
- Do not expose the app through a tunnel, reverse proxy, public IP, or hosted URL unless you intentionally want other people to use your API quota.
- If you later deploy publicly, add rate limiting, origin restrictions, request logging, quota alerts, key rotation, and conservative Image Search query limits.

Local Docker example:

```bash
docker build -t selfie-studio-planner .
docker run --rm -p 127.0.0.1:5173:5173 --env-file .env selfie-studio-planner
```

<details>
<summary id="中文">中文</summary>

# 自拍影棚计划器

Selfie Studio Planner 是一个用于规划低预算、非专业拍摄方案的小型 Web app。它面向手机、手机遥控器、入门微单、廉价背景纸、简单道具、窗光、台灯、小 LED 灯，以及普通家庭或公共场地等场景。

它**不是**专业摄影生产工具，更适合摄影新手、情侣、家庭、好友和个人，用来规划纪念日照片、家庭照、主题自拍或小型好友合照，避免影楼模板化风格。

## 工具能做什么

后端会检测 prompt 语言，并把 required output language 注入 LLM prompt：中文 prompt 生成简体中文方案，英文 prompt 生成英文方案；没有 prompt 的 lucky flow 默认英文。JSON 字段名保持英文。

它会生成：

- 拍摄主题与氛围方向
- 成品视觉参考
- 服装参考和具体搜索关键词
- 道具参考和年代穿帮提醒
- 场景参考和 DIY 替代方案
- 适合低预算空间的布光布景建议
- 表情、姿势、构图建议
- 适合新手的后期处理步骤
- 低成本采购清单和必拍清单
- PNG/PDF 导出，PDF 中会尽量保留参考图来源链接

## 架构

生成流程分三个顺序阶段：

```text
[1] 调研 Agent  →  backgroundContext（作品名、视觉风格、服装/道具/场景/布光考据）
       ↓
[2] 计划 Agent  →  主题方案、带 searchQueries 和 screeningRules 的 referenceGroups
       ↓
[3] 图片 Pipeline  →  Brave 搜索 → metadata 评分 → Vision Reranker（可选）→ 分组图片
```

**阶段 1 — 调研 Agent**（`server/research.js`）：对任何非 lucky prompt，先单独进行一次 LLM 调用，角色是"视觉调研专家"。输出关于作品名、视觉风格、服装细节、道具、场景类型、布光特征、姿势风格、调色方向的核实事实。这些内容会注入到计划 prompt 中，也以可折叠背景简报的形式展示在前端结果顶部。调研 Agent 是尽力而为的：失败时 pipeline 继续，context 为空。

**阶段 2 — 计划 Agent**（`server/llm.js`、`server/prompt.js`）：主方案 LLM 调用接收背景 context，并被要求把每个章节（布光、姿势、服装、调色、道具、场景）都锚定在核实事实上。生成完整主题方案以及分组的 `searchQueries` 和 `screeningRules`，但绝不返回图片 URL。

**阶段 3 — 图片 Pipeline**：Brave Search 为每个参考分组抓取候选图。metadata 评分器根据尺寸、作品名匹配、主体类型匹配和优质来源加分进行排序。如果配置的 LLM provider 是 Anthropic，Vision Reranker（`server/image/reranker.js`）会额外用 `claude-haiku-4-5-20251001` 对每组最多 12 张候选图进行视觉评分（主体匹配、主题契合、真实照片置信度）。综合评分 = 40% metadata + 60% 视觉。Vision Reranker 在超时、报错或非 Anthropic provider 时自动降级为纯 metadata 评分。

职责划分：

- **前端**：主体选择、prompt 输入、图片搜索开关、三阶段加载进度指示（Research → Plan → Images）、结果展示、可折叠背景调研简报、按参考项展示的手动搜图 query chips、图片预览、PNG/PDF 导出。
- **调研 Agent**：在计划生成前核实视觉事实，使方案在年代、服装、布光、场景方面有准确考据，而非通用建议。
- **计划 Agent**：生成主题方案、参考意图、分组搜索 query 和筛选规则。不联网找图，不返回图片 URL。
- **Image Search API**：Brave Search API 按 query 返回候选图片。
- **后端规则**：从背景 context searchHints 扩展 query、基于 metadata 评分、过滤明显不匹配结果、匹配作品名和主体类型、去重、可选视觉重排序，并把 top images 分配到四个分组。

主要代码模块：

- `server.js`：轻量 HTTP 入口和路由分发。
- `server/research.js`：调研 prompt、JSON 提取和 `formatBackgroundContext()`。
- `server/prompt.js`：计划 system prompt（含背景 context 注入）和 JSON 提取。
- `server/llm.js`：LLM provider 配置、`callResearchAgent()`、`callModel()` 和共用 `callLLMText()`。
- `server/routes.js`：编排 research → plan → image hydration，在 API response 中返回 `backgroundContext`。
- `server/image-search.js`：图片 pipeline 的兼容 re-export。
- `server/image/provider.js`：Brave provider 配置、API 调用和候选图标准化。
- `server/image/queries.js`：主体感知 query 生成和每条 reference 的手动 query 分配。
- `server/image/scoring.js`：基于 metadata 的图片评分、作品名匹配和主体 mismatch 降权。
- `server/image/reranker.js`：Anthropic vision reranker（claude-haiku）；非 Anthropic provider 时自动降级。
- `server/image/references.js`：reference group 标准化、图片 hydration 和 reranker 编排。
- `server/static.js`：静态文件服务。
- `public/app.js`：很小的前端模块入口。
- `public/js/*.js`：前端 state、表单行为、结果渲染、图片预览、导出和生成请求模块。

四个图片分组：

- Final Visual References
- Clothing References
- Prop References
- Scene References

## 当前支持能力

LLM API：ZenMux、OpenAI、Gemini、Anthropic Claude，以及通用 OpenAI-compatible 配置。

Image Search API：目前只支持 Brave Search API。

已移除或不支持：LLM web/image search、Vertex AI Search、Google Custom Search JSON API、SerpAPI Google Images、Bing Image Search、Wikimedia Commons fallback。

## 本地运行

```bash
cp .env.example .env
npm start
```

打开 [http://127.0.0.1:5173](http://127.0.0.1:5173)。

## 配置

API key 只由后端读取，不会进入前端。缺少 `BRAVE_SEARCH_API_KEY` 时，前端会禁用 Image Search，但只要 LLM API 已配置，文本方案仍可生成。

推荐配置见英文 README 的 Environment Configuration 部分。

## 本地优先与安全说明

如果只在本机运行，并保持 `HOST=127.0.0.1`，通常不需要做账号系统、验证码、公开限流或复杂的防滥用监控。

仍然需要注意：

- 不要提交 `.env` 或 API key。
- 本地使用时保持 `HOST=127.0.0.1`。
- 不要通过 tunnel、反向代理、公网 IP 或托管 URL 暴露服务，除非你愿意让他人消耗你的 API quota。
- 如果未来重新考虑公网部署，再补充 rate limiting、origin restrictions、request logging、quota alerts、key rotation，以及更保守的 Image Search query 限制。

## 修改 System Prompt

主要 prompt contract 位于：

```text
server/prompt.js -> buildPrompt()
```

你可以修改 `server/prompt.js -> buildPrompt()` 来调整语言策略、参考来源、JSON schema、主体匹配规则、视觉考据规则或 LLM 行为限制。当前策略是在后端检测 prompt 语言，并向 system prompt 注入 required output language，同时保持 JSON 字段名英文稳定。除非你计划重构后端图片 pipeline，否则建议保留 `referenceGroups`、`searchQueries`、`screeningRules` 的结构稳定。

</details>
