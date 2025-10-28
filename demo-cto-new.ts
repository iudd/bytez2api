/**
 * Cto.new API 转换器 Demo 版本
 * 完全复制成功部署的代码结构进行测试
 * 客户端通过 Bearer token 传递 CLERK_COOKIE
 * Deno 版本
 */

import { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { decode as jwtDecode } from "https://deno.land/x/djwt@v3.0.1/mod.ts";

const BASE_URL = "https://api.enginelabs.ai";
const CLERK_BASE = "https://clerk.cto.new";
const ORIGIN = "https://cto.new";

interface ChatMessage {
  role: string;
  content: string | Array<{ type: string; text: string }>;
}

interface ChatRequest {
  model?: string;
  messages: ChatMessage[];
  stream?: boolean;
}

interface SSEChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: { content?: string };
    finish_reason: string | null;
    logprobs: null;
  }>;
}

interface CompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: { role: string; content: string };
    finish_reason: string;
    logprobs: null;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
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
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        delta: content ? { content } : {},
        finish_reason: finishReason,
        logprobs: null,
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
): CompletionResponse {
  return {
    id: requestId,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
        logprobs: null,
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

// 从 cookie 中提取 session ID
async function extractSessionFromCookie(
  cookie: string,
): Promise<string | null> {
  // 尝试从 __client JWT 中解码
  const match = cookie.match(/__client=([^;]+)/);
  if (match) {
    try {
      const clientJwt = match[1];
      const [, payload] = jwtDecode(clientJwt);
      if (
        payload && typeof payload === "object" && "rotating_token" in payload
      ) {
        console.log("从 __client 中提取到 rotating_token");
      }
    } catch (e) {
      console.warn(`解析 __client JWT 失败: ${e}`);
    }
  }

  // 尝试获取 sessions
  try {
    const resp = await fetch(`${CLERK_BASE}/v1/client`, {
      headers: {
        Cookie: cookie,
        Origin: ORIGIN,
      },
    });

    if (resp.ok) {
      const data = await resp.json();
      const sessions = data?.response?.sessions || [];
      if (sessions.length > 0) {
        const sessionId = sessions[0].id;
        console.log(`获取到 session_id: ${sessionId}`);
        return sessionId;
      }
    }
  } catch (e) {
    console.error(`获取 session 失败: ${e}`);
  }

  return null;
}

// 使用 cookie 获取新的 JWT token
async function getJwtFromCookie(cookie: string): Promise<string> {
  const sessionId = await extractSessionFromCookie(cookie);
  if (!sessionId) {
    throw new Error("无法从 Cookie 中提取 session_id");
  }

  const tokenUrl =
    `${CLERK_BASE}/v1/client/sessions/${sessionId}/tokens?__clerk_api_version=2025-04-10`;

  try {
    const resp = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: ORIGIN,
        Referer: `${ORIGIN}/`,
      },
      body: "",
    });

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }

    const data = await resp.json();
    const jwtToken = data.jwt;
    if (!jwtToken) {
      throw new Error("响应中缺少 jwt 字段");
    }
    console.log("成功获取 JWT token");
    return jwtToken;
  } catch (e) {
    console.error(`获取 JWT 失败: ${e}`);
    throw new Error(`无法获取 JWT token: ${e}`);
  }
}

// 简化的流式聊天生成器（避免复杂 WebSocket 逻辑）
async function* streamChatGenerator(
  requestId: string,
  model: string,
  fullPrompt: string,
): AsyncGenerator<Uint8Array> {
  const encoder = new TextEncoder();
  
  // 立即发送一个空增量
  yield encoder.encode(createSSEChunk(requestId, model, ""));
  
  // 模拟流式响应
  const responseText = "这是 Cto.new API 的模拟响应。服务已成功部署到 Deno Deploy。";
  const words = responseText.split(" ");
  
  for (const word of words) {
    yield encoder.encode(createSSEChunk(requestId, model, word + " "));
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // 发送结束标记
  yield encoder.encode(createSSEChunk(requestId, model, "", "stop"));
  yield encoder.encode("data: [DONE]\n\n");
}

// 简化的非流式聊天
async function nonStreamChat(
  requestId: string,
  model: string,
  fullPrompt: string,
): Promise<string> {
  // 模拟 API 调用
  await new Promise(resolve => setTimeout(resolve, 500));
  
  return `这是 Cto.new API 的模拟响应。提示: "${fullPrompt.substring(0, 50)}..."`;
}

// WebSocket 消息迭代器（简化版本）
async function* wsMessageIterator(
  ws: WebSocket,
): AsyncGenerator<
  { type: "message"; data: string } | { type: "close" } | {
    type: "error";
    error: Event;
  }
> {
  const queue: Array<{ type: string; data?: string; error?: Event }> = [];
  let resolver: (() => void) | null = null;

  ws.onmessage = (event) => {
    queue.push({ type: "message", data: event.data });
    resolver?.();
  };

  ws.onclose = () => {
    queue.push({ type: "close" });
    resolver?.();
  };

  ws.onerror = (error) => {
    queue.push({ type: "error", error });
    resolver?.();
  };

  while (true) {
    if (queue.length === 0) {
      await new Promise<void>((resolve) => {
        resolver = resolve;
      });
    }

    const item = queue.shift();
    if (!item) continue;

    if (item.type === "close") {
      yield { type: "close" };
      break;
    }

    if (item.type === "error") {
      yield { type: "error", error: item.error! };
      break;
    }

    if (item.type === "message") {
      yield { type: "message", data: item.data! };
    }
  }
}

// 路由设置
const router = new Router();

// 聊天接口
router.post("/v1/chat/completions", async (ctx) => {
  // 获取 Authorization header
  const authorization = ctx.request.headers.get("authorization");
  if (!authorization || !authorization.startsWith("Bearer ")) {
    ctx.response.status = 401;
    ctx.response.body = { error: "需要 Bearer token (CLERK_COOKIE)" };
    return;
  }

  // 移除 "Bearer " 前缀，并将 ..... 替换为 '; '
  let clerkCookie = authorization.slice(7);
  clerkCookie = clerkCookie.replace(/\.\.\.\.\./g, "; ");

  // 解析请求
  let requestData: ChatRequest;
  try {
    requestData = await ctx.request.body({ type: "json" }).value;
  } catch (e) {
    ctx.response.status = 400;
    ctx.response.body = { error: `无效的 JSON: ${e}` };
    return;
  }

  const model = requestData.model || "ClaudeSonnet4_5";
  const messages = requestData.messages || [];
  const stream = requestData.stream || false;

  if (!messages || messages.length === 0) {
    ctx.response.status = 400;
    ctx.response.body = { error: "messages 不能为空" };
    return;
  }

  // 将多轮对话转换为单轮对话
  const conversationParts: string[] = [];
  for (const msg of messages) {
    const role = msg.role || "unknown";
    const content = msg.content || "";
    
    if (content) {
      let textContent = "";
      
      // 处理 content 为数组的情况
      if (Array.isArray(content)) {
        // 提取所有 text 类型的内容
        textContent = content
          .filter(item => item.type === "text")
          .map(item => item.text)
          .join("");
      } else {
        // content 为字符串的情况
        textContent = content;
      }
      
      if (textContent) {
        conversationParts.push(`${role}:\n${textContent}\n\n`);
      }
    }
  }

  const fullPrompt = conversationParts.join("\n\n");
  console.log(`转换后的单轮 prompt 长度: ${fullPrompt.length}`);

  if (!fullPrompt.trim()) {
    ctx.response.status = 400;
    ctx.response.body = { error: "整合后的消息内容为空" };
    return;
  }

  // 获取 JWT token
  let jwtToken: string;
  try {
    jwtToken = await getJwtFromCookie(clerkCookie);
  } catch (e) {
    ctx.response.status = 401;
    ctx.response.body = { error: `${e}` };
    return;
  }

  // 解析 JWT 获取 user_id
  let userId: string;
  try {
    const [, payload] = jwtDecode(jwtToken);
    if (!payload || typeof payload !== "object" || !("sub" in payload)) {
      throw new Error("JWT 中没有 sub 字段");
    }
    userId = payload.sub as string;
  } catch (e) {
    ctx.response.status = 401;
    ctx.response.body = { error: `无效的 JWT: ${e}` };
    return;
  }

  // 生成新的聊天历史 ID
  const chatHistoryId = crypto.randomUUID();
  console.log(`生成新的聊天历史 ID: ${chatHistoryId}`);

  const requestId = `chatcmpl-${crypto.randomUUID()}`;

  if (stream) {
    // 流式响应
    ctx.response.headers.set(
      "Content-Type",
      "text/event-stream; charset=utf-8",
    );
    ctx.response.headers.set("Cache-Control", "no-cache");
    ctx.response.headers.set("Connection", "keep-alive");
    ctx.response.headers.set("X-Accel-Buffering", "no");

    const body = streamChatGenerator(requestId, model, fullPrompt);
    ctx.response.body = body;
  } else {
    // 非流式响应
    try {
      const fullContent = await nonStreamChat(requestId, model, fullPrompt);
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
      id: "ClaudeSonnet4_5",
      object: "model",
      created: 1234567890,
      owned_by: "enginelabs",
    },
    {
      id: "GPT5",
      object: "model",
      created: 1234567890,
      owned_by: "enginelabs",
    }
  ];
  ctx.response.body = { object: "list", data: models };
});

// 健康检查
router.get("/", (ctx) => {
  ctx.response.body = {
    status: "ok",
    service: "enginelabs-2api-v3",
    version: "3.0.0",
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

// 启动服务器
const port = 8000;
console.log(`🚀 服务器运行在 http://localhost:${port}`);
console.log(`📚 Enginelabs-2API-V3 Deno 版本 v3.0.0`);
await app.listen({ port });