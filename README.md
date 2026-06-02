# 自拍灵感

一个用于生成自拍或自助拍摄主题、参考图提示词、服装道具、布光布景、姿势构图和后期建议的小型 Web app。

## 本地运行

```bash
npm start
```

打开 [http://127.0.0.1:5173](http://127.0.0.1:5173)。

如果你的环境没有 `npm`，也可以直接运行：

```bash
node server.js
```

没有配置 `LLM_API_KEY`、`ZENMUX_API_KEY`、`OPENAI_API_KEY`、`GEMINI_API_KEY` 或 `ANTHROPIC_API_KEY` 时，生成能力不可用，页面会提示先配置 API。

## 配置 LLM

项目不会把 API Key 写进前端，也不会提交到仓库。后端会从下面两个地方读取配置：

1. 本地开发：项目根目录的 `.env` 文件。
2. 线上部署：部署平台的 Environment Variables / Secrets 设置页。

本地可以复制 `.env.example` 为 `.env`：

```bash
cp .env.example .env
```

配置优先级：

1. `LLM_API_KEY` 通用配置。
2. `ZENMUX_API_KEY` ZenMux 便利配置。
3. `GEMINI_API_KEY` Gemini 便利配置。
4. `ANTHROPIC_API_KEY` Anthropic Claude 便利配置。
5. `OPENAI_API_KEY` OpenAI 便利配置。

然后编辑 `.env`。如果你想经常切换供应商，推荐使用通用配置：

```bash
LLM_API_KEY=你的_key
LLM_PROVIDER=zenmux
LLM_PROTOCOL=chat
LLM_MODEL=google/gemini-3.1-flash-lite
LLM_BASE_URL=https://zenmux.ai/api/v1
PORT=5173
HOST=127.0.0.1
```

如果使用 ZenMux 便利配置，也可以写：

```bash
ZENMUX_API_KEY=你的_ZenMux_key
ZENMUX_MODEL=google/gemini-3.1-flash-lite
ZENMUX_BASE_URL=https://zenmux.ai/api/v1
IMAGE_SEARCH_PROVIDER=brave
BRAVE_SEARCH_API_KEY=
BRAVE_IMAGE_SEARCH_ENDPOINT=https://api.search.brave.com/res/v1/images/search
BRAVE_SEARCH_COUNTRY=US
BRAVE_SEARCH_LANG=en
BRAVE_SAFESEARCH=strict
BRAVE_IMAGE_SEARCH_COUNT=20
IMAGE_SEARCH_QUERIES_PER_GROUP=2
PORT=5173
HOST=127.0.0.1
```

注意：

- `ZENMUX_BASE_URL` 是推理 API 地址，不是 management API 地址；不要填写 `/management`。
- 推荐先使用固定模型验证本地链路，例如 `google/gemini-3.1-flash-lite`。
- `IMAGE_SEARCH_PROVIDER=brave` 表示图片检索只使用 Brave Search API。LLM 不负责联网找图，也不会返回图片 URL。
- 如果要使用 ZenMux model routing，可以把 `ZENMUX_MODEL` 或 `LLM_MODEL` 改成 `zenmux/auto`，并设置 `ZENMUX_ROUTING_PREFERENCE=balanced` 或 `LLM_ROUTING_PREFERENCE=balanced`。后端会发送 `model_routing_config`。只有你明确配置 `ZENMUX_ROUTING_MODELS` 或 `LLM_ROUTING_MODELS` 时，才会发送 `available_models` 候选池；候选模型必须是 ZenMux 当前模型列表里的有效 slug。
- 如果 `zenmux/auto` 返回 `invalid_model` 或 `internal_server_error`，先切回固定模型。这通常表示 ZenMux router 当前选择的模型或候选池不可用，不代表 API key 或本地代码配置错误。

## 配置图片搜索

首页的“图片搜索”开关会调用后端图片搜索 API。API key 只放在后端 `.env` 或部署平台 secrets，前端不会拿到密钥。

当前图片链路是独立的小型视觉检索与筛选 pipeline：

```text
referenceIntent -> query generation -> Brave image search -> rule scoring -> grouped top images
```

LLM 负责分析 prompt、拍摄主体、视觉意图、分组搜索 query 和筛选规则；Brave Search API 负责获取候选图；后端负责质量筛选、主体匹配、去重、排序，并把图片分配到“成品参考 / 服装参考 / 道具参考 / 场景参考”四组；前端负责展示图片和来源出处。

Brave Search API：

```bash
IMAGE_SEARCH_PROVIDER=brave
BRAVE_SEARCH_API_KEY=你的_Brave_Search_API_key
BRAVE_IMAGE_SEARCH_ENDPOINT=https://api.search.brave.com/res/v1/images/search
BRAVE_SEARCH_COUNTRY=US
BRAVE_SEARCH_LANG=en
BRAVE_SAFESEARCH=strict
BRAVE_SPELLCHECK=1
BRAVE_IMAGE_SEARCH_COUNT=20
IMAGE_SEARCH_QUERIES_PER_GROUP=2
```

`IMAGE_SEARCH_QUERIES_PER_GROUP=2` 表示每个图片分组最多发起 2 次 Brave 图片搜索请求；需要更高召回率时可以调大。如果没有配置 `BRAVE_SEARCH_API_KEY`，前端会禁用“图片搜索”，但仍然可以生成文本方案。

如果直接使用 OpenAI，再改成：

```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4.1-mini
OPENAI_BASE_URL=https://api.openai.com/v1
PORT=5173
HOST=127.0.0.1
```

如果使用 Gemini，可以走 Google 的 OpenAI-compatible endpoint：

```bash
GEMINI_API_KEY=你的_Gemini_key
GEMINI_MODEL=gemini-2.5-flash
GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
PORT=5173
HOST=127.0.0.1
```

如果使用 Anthropic Claude 原生 Messages API：

```bash
ANTHROPIC_API_KEY=你的_Anthropic_key
ANTHROPIC_MODEL=claude-sonnet-4-5-20250929
ANTHROPIC_BASE_URL=https://api.anthropic.com/v1
PORT=5173
HOST=127.0.0.1
```

再启动服务：

```bash
npm start
```

如果你的环境没有 `npm`：

```bash
node server.js
```

如果你使用其它兼容 OpenAI API 的服务，可以使用 `LLM_API_KEY`、`LLM_PROTOCOL=chat`、`LLM_BASE_URL` 和 `LLM_MODEL` 配置。

生成内容默认使用简体中文；首页 UI 也保持中文。

## Docker

```bash
docker build -t photo-inspiration .
docker run --rm -p 5173:5173 --env-file .env photo-inspiration
```

然后访问 [http://127.0.0.1:5173](http://127.0.0.1:5173)。

## 免费部署建议

- Render：适合这个项目当前形态，可以直接部署 Node Web Service，设置 `LLM_API_KEY` 或对应供应商 API key 即可。免费服务可能休眠，首次访问会慢一些。
- Railway：适合快速试用，当前政策以 credits/trial 为主，长期分享给家人前建议先看账单额度。
- Fly.io：适合 Docker 部署，但当前更偏按量计费或试用，不建议把它当作稳定免费托管。
- Vercel/Netlify/Cloudflare Pages：纯前端免费部署很方便；如果要部署当前后端接口，需要把 `/api/generate` 改成对应平台的 serverless function 或 worker。

## 导出

- PNG：当前页面会把生成方案导出成一张干净的摘要图。
- PDF：使用浏览器打印能力，可在打印窗口中选择“保存为 PDF”。
