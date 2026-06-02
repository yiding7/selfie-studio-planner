# 项目上下文

## 当前目标

自拍灵感是一个用于生成低预算、自助拍摄方案的 Web app。用户选择拍摄主体并输入主题 prompt，系统生成主题方案、参考意图、服装道具、布光布景、姿势构图、后期建议，以及四组图片参考。

## 架构边界

- LLM 只负责分析 prompt、生成主题方案、referenceIntent、分组 searchQueries 和 screeningRules。
- LLM 不负责联网搜索图片，不返回图片直链或来源页。
- 图片检索只使用 Brave Search API。
- 后端负责 query generation、Brave image search、规则评分、去重、质量筛选、主体匹配、分组 top images。
- 前端负责展示生成结果、四组图片、来源链接、放大预览、导出 PNG/PDF。

## 图片 pipeline

```text
referenceIntent -> query generation -> Brave image search -> rule scoring -> grouped top images
```

四个图片分组都应展示候选图：

- 成品参考
- 服装参考
- 道具参考
- 场景参考

## 支持的 API

LLM:

- ZenMux
- OpenAI
- Gemini
- Anthropic Claude
- 通用 OpenAI-compatible chat/responses 配置

Image API:

- Brave Search API only

已明确移除或不再支持：

- LLM web/image search 图片链路
- Vertex AI Search
- Google Custom Search JSON API
- SerpAPI Google Images
- Bing Image Search
- Wikimedia Commons fallback

## 配置原则

- `.env` 不提交。
- API key 只在后端环境变量中读取，不进入前端。
- 未配置 LLM API 时，生成不可用并返回配置提示。
- 未配置 Brave Search API 时，前端禁用“图片搜索”，文本方案仍可生成。

## 推荐本地运行

```bash
cp .env.example .env
npm start
```

打开 `http://127.0.0.1:5173`。

## 继续开发注意事项

- 不要重新引入多图片搜索 provider，除非产品方向明确改变。
- 不要让 LLM 直接返回图片 URL；图片 URL 质量和可用性由 Brave + 后端规则控制。
- 若要提高图片质量，优先改 query generation、scoring、dedupe、source/domain scoring，而不是把更多 API 混进来。
- 若要部署给亲友使用，优先考虑后端限流和 API key 滥用保护，再考虑公开 URL。
