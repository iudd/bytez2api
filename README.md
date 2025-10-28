# bytez2api
Fork of ctonew-proxy for custom API development
Cto.new API 转换器 (Bytez 版本)
📋 项目说明
本项目是一个 OpenAI 兼容的 API 代理服务器，用于将请求转发到 Bytez API。

🚀 功能特性
✅ 流式响应支持: 使用 SSE 实现聊天流（data: { ... }）。
✅ OpenAI 兼容格式: 支持 ChatRequest 和 CompletionResponse 格式。
✅ 简化的认证: 直接使用 Authorization: BYTEZ_KEY 认证（无需 JWT）。
✅ 多模型支持: 支持 openai-community/gpt2 等模型。
🛠️ 技术栈
语言: TypeScript
运行时: Deno
框架: Oak
目标 API: Bytez Model API
📡 API 端点
1. 文本补全 (/v1/completions)
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
2. 模型列表 (/v1/models)
curl -X GET "http://localhost:8000/v1/models" \
  -H "Authorization: BYTEZ_KEY"
3. 健康检查 (/)
curl -X GET "http://localhost:8000/"
🚀 本地运行
# 克隆仓库
git clone https://github.com/iudd/ctonew-proxy.git
cd ctonew-proxy

# 切换到 bytez 分支
git checkout bytez

# 启动服务器
deno run --allow-net --allow-env server.ts
📝 更新日志
v1.0.0: 初始版本，支持 Bytez API 转发和流式响应。
📌 注意事项
确保 Authorization: BYTEZ_KEY 中的 BYTEZ_KEY 替换为实际的 API Key。
模型名称需与 Bytez API 支持的模型一致（如 openai-community/gpt2）。
🤝 贡献
欢迎提交 Issue 或 Pull Request！
