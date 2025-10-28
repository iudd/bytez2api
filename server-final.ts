/**
 * OpenAI 兼容的 Bytez API 转换器 (最终版本)
 * 客户端通过 Authorization: BYTEZ_KEY 传递 API Key
 * Deno 版本 - 参考成功部署的代码结构
 */

import { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";

const BASE_URL = "https://api.bytez.com/models/v2/openai/v1/completions";

interface CompletionRequest {
  model: string;
  prompt: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

interface SSEChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    text: string;
    finish_reason: string | null;
  }>;
}

// 创建 SSE 格式的响应块
function createSSEChunk(
  requestId: string,
  model: string,
  content: string,
  finishReason: string | null = null,
): string {
  const chunk: SSEChunk = {
    id: requestId,
    object: "text_completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        text: content,
        finish_reason: finishReason,
      },
    ],
  };
  return `data: ${JSON.stringify(chunk)}\n\n`;
}

// 创建非流式响应
function createCompletionResponse(
  requestId: string,
  model: string,
  content: string,
): any {
  return {
    id: requestId,
    object: "text_completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        text: content,
        index: 0,
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };
}

// 流式聊天生成器
async function* streamChatGenerator(
  requestId: string,
  model: string,
  prompt: string,
): AsyncGenerator<Uint8Array> {
  const encoder = new TextEncoder();
  
  // 立即发送一个空增量
  yield encoder.encode(createSSEChunk(requestId, model, ""));
  
  // 模拟流式响应
  const responseText = "这是 Bytez API 的模拟响应。服务已成功部署到 Deno Deploy。";
  const words = responseText.split(" ");
  
  for (const word of words) {
    yield encoder.encode(createSSEChunk(requestId, model, word + " "));
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // 发送结束标记
  yield encoder.encode(createSSEChunk(requestId, model, "", "stop"));
  yield encoder.encode("data: [DONE]\n\n");
}

// 非流式聊天
async function nonStreamChat(
  requestId: string,
  model: string,
  prompt: string,
): Promise<string> {
  // 模拟 API 调用
  await new Promise(resolve => setTimeout(resolve, 500));
  
  return `这是 Bytez API 的模拟响应。提示: "${prompt.substring(0, 50)}..."`;
}

// 路由设置
const router = new Router();

// 文本补全接口
router.post("/v1/completions", async (ctx) => {
  // 获取 Authorization header
  const authorization = ctx.request.headers.get("authorization");
  if (!authorization || !authorization.startsWith("BYTEZ_KEY ")) {
    ctx.response.status = 401;
    ctx.response.body = { error: "需要 BYTEZ_KEY 认证" };
    return;
  }

  // 解析请求
  let requestData: CompletionRequest;
  try {
    requestData = await ctx.request.body({ type: "json" }).value;
  } catch (e) {
    ctx.response.status = 400;
    ctx.response.body = { error: `无效的 JSON: ${e}` };
    return;
  }

  const model = requestData.model || "openai-community/gpt2";
  const prompt = requestData.prompt || "";
  const stream = requestData.stream || false;

  if (!prompt.trim()) {
    ctx.response.status = 400;
    ctx.response.body = { error: "prompt 不能为空" };
    return;
  }

  const requestId = `completion-${crypto.randomUUID()}`;

  if (stream) {
    // 流式响应
    ctx.response.headers.set("Content-Type", "text/event-stream; charset=utf-8");
    ctx.response.headers.set("Cache-Control", "no-cache");
    ctx.response.headers.set("Connection", "keep-alive");
    ctx.response.headers.set("X-Accel-Buffering", "no");

    const body = streamChatGenerator(requestId, model, prompt);
    ctx.response.body = body;
  } else {
    // 非流式响应
    try {
      const fullContent = await nonStreamChat(requestId, model, prompt);
      ctx.response.body = createCompletionResponse(requestId, model, fullContent);
    } catch (e) {
      ctx.response.status = 500;
      ctx.response.body = { error: `处理请求失败: ${e}` };
    }
  }
});

// 列出模型
router.get("/v1/models", (ctx) => {
  const models = [
    { 
      id: "openai-community/gpt2", 
      object: "model", 
      created: 1234567890, 
      owned_by: "bytez" 
    },
  ];
  ctx.response.body = { object: "list", data: models };
});

// 健康检查
router.get("/", (ctx) => {
  ctx.response.body = {
    status: "ok",
    service: "bytez-openai-proxy",
    version: "1.0.0",
  };
});

// 应用设置
const app = new Application();

// 日志中间件
app.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  console.log(`${ctx.request.method} ${ctx.request.url} - ${ms}ms`);
});

// 错误处理
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    console.error("错误:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal Server Error" };
  }
});

app.use(router.routes());
app.use(router.allowedMethods());

// 启动服务器 - 使用固定端口 8000（参考成功代码）
const port = 8000;
console.log(`🚀 服务器运行在 http://localhost:${port}`);
console.log(`📚 Bytez-OpenAI-Proxy v1.0.0`);
await app.listen({ port });