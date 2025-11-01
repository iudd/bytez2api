# bytez2api
Fork of ctonew-proxy for custom API development
Cto.new API 转换器 (Bytez 版本)
📋 项目说明
本项目是一个 OpenAI 兼容的 API 代理服务器，包含多个 API 转换器功能。

## 🚀 主要功能

### 1. Bytez API 转换器 (`deno-deploy.ts`)
- OpenAI 兼容的 API 代理服务器，用于将请求转发到 Bytez API
- ✅ 流式响应支持: 使用 SSE 实现聊天流（data: { ... }）
- ✅ OpenAI 兼容格式: 支持 ChatRequest 和 CompletionResponse 格式
- ✅ 简化的认证: 直接使用 Authorization: BYTEZ_KEY 认证（无需 JWT）
- ✅ 多模型支持: 支持 openai-community/gpt2 等模型

### 2. FreeAIImage API 转换器 (`freeaiimage-api.ts`)
- OpenAI 兼容的图像生成 API，用于将请求转发到 FreeAIImage
- ✅ 图像生成支持: 支持 DALL-E 兼容的图像生成接口
- ✅ 异步任务处理: 支持任务创建和状态轮询
- ✅ 流式状态更新: 支持 SSE 流式状态监控
- ✅ 多尺寸支持: 支持多种图像尺寸生成

🛠️ 技术栈
语言: TypeScript
运行时: Deno
框架: Oak
目标 API: Bytez Model API / FreeAIImage API
📡 API 端点

## Bytez API 转换器 (端口: 8000)

1. 文本补全 (/v1/completions)
```bash
curl -X POST "http://localhost:8000/v1/completions" \
  -H "Authorization: BYTEZ_KEY" \
  -H "Content-Type: application/json" \
  --data '{
    "model": "openai-community/gpt2",
    "prompt": "Write a short poem about AI",
    "temperature": 0.7,
    "max_tokens": 150,
    "stream": true
  }'
```

2. 模型列表 (/v1/models)
```bash
curl -X GET "http://localhost:8000/v1/models" \
  -H "Authorization: BYTEZ_KEY"
```

3. 健康检查 (/)
```bash
curl -X GET "http://localhost:8000/"
```

## FreeAIImage API 转换器 (端口: 8001)

1. 图像生成 (/v1/images/generations)
```bash
curl -X POST "http://localhost:8001/v1/images/generations" \
  -H "Content-Type: application/json" \
  --data '{
    "model": "qwen-image",
    "prompt": "A beautiful sunset over mountains",
    "size": "1024x1024",
    "n": 2
  }'
```

2. 流式图像生成状态 (/v1/images/generations/stream)
```bash
curl -X POST "http://localhost:8001/v1/images/generations/stream" \
  -H "Content-Type: application/json" \
  --data '{
    "prompt": "A beautiful sunset over mountains",
    "size": "1024x1024"
  }'
```

3. 模型列表 (/v1/models)
```bash
curl -X GET "http://localhost:8001/v1/models"
```

4. 健康检查 (/)
```bash
curl -X GET "http://localhost:8001/"
```
🚀 本地运行

## 启动 Bytez API 转换器 (端口: 8000)
```bash
# 启动 deno-deploy.ts (Bytez API)
deno run --allow-net --allow-env deno-deploy.ts
```

## 启动 FreeAIImage API 转换器 (端口: 8001)
```bash
# 启动 freeaiimage-api.ts (FreeAIImage API)
deno run --allow-net --allow-env freeaiimage-api.ts
```

## 同时启动两个服务
```bash
# 在终端1启动 Bytez API
deno run --allow-net --allow-env deno-deploy.ts

# 在终端2启动 FreeAIImage API
deno run --allow-net --allow-env freeaiimage-api.ts
```

## 项目文件说明
- `deno-deploy.ts` - Bytez API 转换器主程序
- `freeaiimage-api.ts` - FreeAIImage API 转换器主程序
- `server.ts` - 其他服务器实现（可选）
📝 更新日志
v1.1.0: 新增 FreeAIImage API 转换器，支持 OpenAI 兼容的图像生成接口
v1.0.0: 初始版本，支持 Bytez API 转发和流式响应。
📌 注意事项
确保 Authorization: BYTEZ_KEY 中的 BYTEZ_KEY 替换为实际的 API Key。
模型名称需与 Bytez API 支持的模型一致（如 openai-community/gpt2）。
🤝 贡献
欢迎提交 Issue 或 Pull Request！
