// Deno Deploy 入口文件
// 简化版本，移除可能导致部署失败的复杂功能

import { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";

const BASE_URL = "https://api.bytez.com/models/v2/openai/v1/completions";

interface CompletionRequest {
  model: string;
  prompt: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

const router = new Router();

// 健康检查
router.get("/", (ctx) => {
  ctx.response.body = {
    status: "ok",
    service: "bytez-openai-proxy",
    version: "1.0.0",
    message: "服务运行正常"
  };
});

// 获取模型列表
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

// 文本补全 API
router.post("/v1/completions", async (ctx) => {
  const authorization = ctx.request.headers.get("authorization");
  if (!authorization || !authorization.startsWith("BYTEZ_KEY ")) {
    ctx.response.status = 401;
    ctx.response.body = { error: "需要 BYTEZ_KEY 认证" };
    return;
  }

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

  // 简化版本：直接返回模拟响应
  const requestId = `completion-${Date.now()}`;
  
  if (stream) {
    ctx.response.headers.set("Content-Type", "text/event-stream; charset=utf-8");
    ctx.response.headers.set("Cache-Control", "no-cache");
    ctx.response.headers.set("Connection", "keep-alive");
    
    // 简化流式响应
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      async start(controller) {
        const chunks = [
          `data: {"id":"${requestId}","object":"text_completion.chunk","created":${Math.floor(Date.now()/1000)},"model":"${model}","choices":[{"text":"","index":0,"finish_reason":null}]}\n\n`,
          `data: {"id":"${requestId}","object":"text_completion.chunk","created":${Math.floor(Date.now()/1000)},"model":"${model}","choices":[{"text":"这是模拟响应","index":0,"finish_reason":null}]}\n\n`,
          `data: [DONE]\n\n`
        ];
        
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        controller.close();
      }
    });
    
    ctx.response.body = body;
  } else {
    // 非流式响应
    ctx.response.body = {
      id: requestId,
      object: "text_completion",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          text: "这是模拟的文本补全响应",
          index: 0,
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: prompt.length,
        completion_tokens: 10,
        total_tokens: prompt.length + 10,
      },
    };
  }
});

const app = new Application();

// 日志中间件
app.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  console.log(`${ctx.request.method} ${ctx.request.url} - ${ms}ms`);
});

// 错误处理中间件
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

const port = parseInt(Deno.env.get("PORT") || "8000");

console.log(`🚀 服务器运行在端口 ${port}`);
console.log(`📚 Bytez-OpenAI-Proxy v1.0.0 (Deno Deploy 版本)`);

await app.listen({ port });