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

The current image pipeline is intentionally small and explicit:

```text
referenceIntent -> query generation -> Brave image search -> rule scoring -> grouped top images
```

Responsibilities:

- **Frontend**: subject selection, prompt input, Image Search toggle, result rendering, image preview modal, PNG/PDF export.
- **LLM backend call**: generates the theme plan, reference intent, grouped search queries, and screening rules. It does not browse for images and must not return image URLs.
- **Image Search API**: Brave Search API returns candidate images.
- **Backend rules**: generate/expand queries, score image quality, filter obvious mismatches, lightly match subject type, dedupe, and assign top images to the four groups.

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
IMAGE_SEARCH_QUERIES_PER_GROUP=2

PORT=5173
HOST=127.0.0.1
```

Notes:

- API keys are read only by the backend. They are not sent to the frontend.
- `.env` is ignored by git and should not be committed.
- `IMAGE_SEARCH_QUERIES_PER_GROUP=2` limits Brave image requests per reference group. Increase it for more recall, lower it for cost control.
- `BRAVE_IMAGE_SEARCH_COUNT=20` controls candidate images per query before backend ranking.

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
server.js -> buildPrompt()
```

Edit `buildPrompt()` to adapt the tool to your own workflow, language policy, reference sources, JSON schema, subject-type rules, visual grounding rules, or LLM behavior limits. The current policy detects the prompt language server-side, injects a required output language into the system prompt, and keeps JSON field names stable in English.

Important constraints to preserve unless you intentionally redesign the app:

- Keep the JSON shape stable, especially `referenceGroups`, `searchQueries`, and `screeningRules`.
- Do not ask the LLM to return image URLs. The backend image pipeline owns image retrieval and scoring.
- Keep reference group titles aligned with backend scoring rules in `scoreImageCandidate()`.

## Export

- PNG export captures the generated plan as an image.
- PDF export uses html2pdf.js and keeps source links for reference images when the PDF viewer supports clickable links.

## Deployment Notes

The current app is a small Node web service serving static frontend files and backend API routes. It can run locally with Docker or on a simple Node hosting platform.

```bash
docker build -t selfie-studio-planner .
docker run --rm -p 5173:5173 --env-file .env selfie-studio-planner
```

For public sharing, add abuse protection before exposing your own API keys to friends or family through a hosted URL. Good next steps include rate limiting, origin restrictions, request logging, and conservative Image Search query limits.

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

当前图片链路是：

```text
referenceIntent -> query generation -> Brave image search -> rule scoring -> grouped top images
```

职责划分：

- **前端**：主体选择、prompt 输入、图片搜索开关、结果展示、图片预览、PNG/PDF 导出。
- **LLM 后端调用**：生成主题方案、参考意图、分组搜索 query 和筛选规则。LLM 不联网找图，也不返回图片 URL。
- **Image Search API**：Brave Search API 返回候选图片。
- **后端规则**：扩展 query、评分、过滤明显不匹配结果、轻量主体匹配、去重，并把 top images 分配到四个分组。

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

## 修改 System Prompt

主要 prompt contract 位于：

```text
server.js -> buildPrompt()
```

你可以修改 `buildPrompt()` 来调整语言策略、参考来源、JSON schema、主体匹配规则、视觉考据规则或 LLM 行为限制。当前策略是在后端检测 prompt 语言，并向 system prompt 注入 required output language，同时保持 JSON 字段名英文稳定。除非你计划重构后端图片 pipeline，否则建议保留 `referenceGroups`、`searchQueries`、`screeningRules` 的结构稳定。

</details>
