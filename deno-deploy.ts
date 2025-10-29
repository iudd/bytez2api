/**
 * Bytez API 转换器 - Deno Deploy 专用版本
 * 连接到真实的 Bytez API 端点
 */

import { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";

const app = new Application();
const router = new Router();

// Bytez API 端点 - 基于你原有代码的正确配置
const BYTEZ_BASE_URL = "https://api.bytez.com/models/v2/openai/v1";

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
    { 
      id: "Qwen/Qwen3-4B", 
      object: "model", 
      created: 1234567890, 
      owned_by: "bytez" 
    },
  ];
  ctx.response.body = { object: "list", data: models };
});

// 聊天补全 API (连接到真实 Bytez API)
router.post("/v1/chat/completions", async (ctx) => {
  try {
    // 检查认证 - 支持 Bearer 和 BYTEZ_KEY 两种格式
    const authorization = ctx.request.headers.get("authorization");
    let apiKey = null;
    
    if (!authorization) {
      ctx.response.status = 401;
      ctx.response.body = { error: "需要 API Key 认证" };
      return;
    }
    
    if (authorization.startsWith("Bearer ")) {
      apiKey = authorization.slice(7);
    } else if (authorization.startsWith("BYTEZ_KEY ")) {
      apiKey = authorization.slice(10);
    } else {
      ctx.response.status = 401;
      ctx.response.body = { error: "无效的认证格式，请使用 Bearer 或 BYTEZ_KEY" };
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

    const model = requestData.model || "Qwen/Qwen3-4B";
    const messages = requestData.messages || [];
    const stream = requestData.stream || false;

    if (!messages.length) {
      ctx.response.status = 400;
      ctx.response.body = { error: "messages 不能为空" };
      return;
    }

    // 转发请求到真实的 Bytez API
    const bytezResponse = await fetch(`${BYTEZ_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: requestData.temperature || 0.7,
        max_tokens: requestData.max_tokens || 150,
        stream: stream
      })
    });

    if (!bytezResponse.ok) {
      const errorText = await bytezResponse.text();
      console.error("Bytez API 错误:", bytezResponse.status, errorText);
      ctx.response.status = bytezResponse.status;
      ctx.response.body = { error: `Bytez API 错误: ${bytezResponse.status}` };
      return;
    }

    // 如果是流式响应，直接转发
    if (stream) {
      ctx.response.headers.set("Content-Type", "text/event-stream; charset=utf-8");
      ctx.response.headers.set("Cache-Control", "no-cache");
      ctx.response.headers.set("Connection", "keep-alive");
      
      ctx.response.body = bytezResponse.body;
    } else {
      // 非流式响应，解析 JSON
      const result = await bytezResponse.json();
      ctx.response.body = result;
    }

  } catch (error) {
    console.error("处理请求错误:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal Server Error" };
  }
});

// 文本补全 API (连接到真实 Bytez API)
router.post("/v1/completions", async (ctx) => {
  try {
    // 检查认证 - 支持 Bearer 和 BYTEZ_KEY 两种格式
    const authorization = ctx.request.headers.get("authorization");
    let apiKey = null;
    
    if (!authorization) {
      ctx.response.status = 401;
      ctx.response.body = { error: "需要 API Key 认证" };
      return;
    }
    
    if (authorization.startsWith("Bearer ")) {
      apiKey = authorization.slice(7);
    } else if (authorization.startsWith("BYTEZ_KEY ")) {
      apiKey = authorization.slice(10);
    } else {
      ctx.response.status = 401;
      ctx.response.body = { error: "无效的认证格式，请使用 Bearer 或 BYTEZ_KEY" };
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

    // 转发请求到真实的 Bytez API
    const bytezResponse = await fetch(`${BYTEZ_BASE_URL}/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model,
        prompt: prompt,
        temperature: requestData.temperature || 0.7,
        max_tokens: requestData.max_tokens || 150,
        stream: stream
      })
    });

    if (!bytezResponse.ok) {
      const errorText = await bytezResponse.text();
      console.error("Bytez API 错误:", bytezResponse.status, errorText);
      ctx.response.status = bytezResponse.status;
      ctx.response.body = { error: `Bytez API 错误: ${bytezResponse.status}` };
      return;
    }

    // 如果是流式响应，直接转发
    if (stream) {
      ctx.response.headers.set("Content-Type", "text/event-stream; charset=utf-8");
      ctx.response.headers.set("Cache-Control", "no-cache");
      ctx.response.headers.set("Connection", "keep-alive");
      
      ctx.response.body = bytezResponse.body;
    } else {
      // 非流式响应，解析 JSON
      const result = await bytezResponse.json();
      ctx.response.body = result;
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
const port = parseInt(Deno.env.get("PORT") || "8000");
console.log(`🚀 Deno Deploy 服务器运行在 http://localhost:${port}`);
console.log(`📚 Bytez-OpenAI-Proxy Deno Deploy 版本 v1.0.0`);
await app.listen({ port });