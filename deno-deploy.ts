/**
 * Bytez API 转换器 - Deno Deploy 专用版本
 * 极度简化，确保部署成功
 */

import { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";

const app = new Application();
const router = new Router();

// 健康检查
router.get("/", (ctx) => {
  ctx.response.body = {
    status: "ok",
    service: "bytez-openai-proxy",
    version: "1.0.0",
    message: "Deno Deploy 专用版本运行正常"
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

// 文本补全 API (简化版本)
router.post("/v1/completions", async (ctx) => {
  try {
    // 检查认证
    const authorization = ctx.request.headers.get("authorization");
    if (!authorization || !authorization.startsWith("BYTEZ_KEY ")) {
      ctx.response.status = 401;
      ctx.response.body = { error: "需要 BYTEZ_KEY 认证" };
      return;
    }

    // 解析请求
    let requestData;
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

    const requestId = `completion-${Date.now()}`;

    if (stream) {
      // 流式响应 (简化)
      ctx.response.headers.set("Content-Type", "text/event-stream; charset=utf-8");
      ctx.response.headers.set("Cache-Control", "no-cache");
      ctx.response.headers.set("Connection", "keep-alive");

      const encoder = new TextEncoder();
      const body = new ReadableStream({
        async start(controller) {
          // 发送开始标记
          controller.enqueue(encoder.encode(`data: {"id":"${requestId}","object":"text_completion.chunk","created":${Math.floor(Date.now()/1000)},"model":"${model}","choices":[{"text":"","index":0,"finish_reason":null}]}\n\n`));
          
          // 模拟流式响应
          const response = "这是 Bytez API 的模拟响应。服务已成功部署到 Deno Deploy。";
          const words = response.split(" ");
          
          for (const word of words) {
            controller.enqueue(encoder.encode(`data: {"id":"${requestId}","object":"text_completion.chunk","created":${Math.floor(Date.now()/1000)},"model":"${model}","choices":[{"text":"${word} ","index":0,"finish_reason":null}]}\n\n`));
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
          // 发送结束标记
          controller.enqueue(encoder.encode(`data: {"id":"${requestId}","object":"text_completion.chunk","created":${Math.floor(Date.now()/1000)},"model":"${model}","choices":[{"text":"","index":0,"finish_reason":"stop"}]}\n\n`));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
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
            text: "这是 Bytez API 的模拟响应。服务已成功部署到 Deno Deploy。",
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
  } catch (error) {
    console.error("处理请求错误:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal Server Error" };
  }
});

// 中间件
app.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  console.log(`${ctx.request.method} ${ctx.request.url} - ${ms}ms`);
});

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

// 启动服务器
const port = 8000;
console.log(`🚀 Deno Deploy 服务器运行在 http://localhost:${port}`);
console.log(`📚 Bytez-OpenAI-Proxy Deno Deploy 版本 v1.0.0`);
await app.listen({ port });