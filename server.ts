/**
 * OpenAI 兼容的 Bytez API 转换器 (无状态版本)
 * 客户端通过 Authorization: BYTEZ_KEY 传递 API Key
 * Deno 版本
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

function createSSEChunk(
  requestId: string,
  model: string,
  content: string,
  finishReason: string | null = null
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

function createCompletionResponse(
  requestId: string,
  model: string,
  content: string
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

async function* streamChatGenerator(
  requestId: string,
  model: string,
  userId: string,
  fullPrompt: string
): AsyncGenerator<Uint8Array> {
  const encoder = new TextEncoder();
  const wsUrl = `wss://api.bytez.com/models/v2/openai/v1/completions/stream?token=${userId}`;

  yield encoder.encode(createSSEChunk(requestId, model, ""));

  let receivedUpdate = false;
  let lastBufferType: string | null = null;
  let inThinkingBlock = false;
  const modeByType: Record<string, "snapshot" | "delta"> = {};
  const prevContentByType: Record<string, string> = {};

  try {
    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => {
        console.log(`WebSocket 已连接: ${userId}`);
        resolve();
      };
      ws.onerror = (e) => reject(e);
    });

    const triggerChat = async () => {
      const payload = {
        prompt: fullPrompt,
        model,
        temperature: 0.7,
        max_tokens: 150,
      };
      const headers = {
        Authorization: `Bearer BYTEZ_KEY`, // 直接使用 BYTEZ_KEY 认证
        "Content-Type": "application/json",
      };

      try {
        const resp = await fetch(`${BASE_URL}`, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });
        if (!resp.ok) {
          const text = await resp.text();
          console.warn(`触发消息失败: ${resp.status} ${text.slice(0, 200)}`);
        }
      } catch (e) {
        console.error(`触发消息异常: ${e}`);
      }
    };

    triggerChat();

    for await (const event of wsMessageIterator(ws)) {
      if (event.type === "close") break;
      if (event.type === "error") {
        console.error("WebSocket 错误:", event.error);
        break;
      }

      try {
        const data = JSON.parse(event.data);
        const msgType = data.type;

        if (msgType === "update") {
          receivedUpdate = true;
          const bufferStr = data.buffer || "{}";
          try {
            const bufferData = JSON.parse(bufferStr);
            const bufferType = bufferData.type;

            if (bufferType === "completion") {
              const content = bufferData.completion?.text || "";
              if (content) {
                if (bufferType !== lastBufferType) {
                  if (inThinkingBlock) {
                    yield encoder.encode(createSSEChunk(requestId, model, "]]\n\n"));
                    inThinkingBlock = false;
                  }
                  if (bufferType === "thinking") {
                    yield encoder.encode(createSSEChunk(requestId, model, " "));
                    inThinkingBlock = true;
                  }
                  lastBufferType = bufferType;
                }

                const prev = prevContentByType[bufferType] ?? "";
                let mode = modeByType[bufferType];
                let delta = "";
                if (!mode && prev) {
                  if (content.startsWith(prev)) {
                    mode = "snapshot";
                    modeByType[bufferType] = mode;
                  } else {
                    mode = "delta";
                    modeByType[bufferType] = mode;
                  }
                }
                if (mode === "snapshot") {
                  delta = content.slice(prev.length);
                  prevContentByType[bufferType] = content;
                } else if (mode === "delta") {
                  delta = content;
                  prevContentByType[bufferType] = prev + content;
                } else {
                  delta = content;
                  prevContentByType[bufferType] = content;
                }
                if (delta) {
                  yield encoder.encode(createSSEChunk(requestId, model, delta));
                }
              }
            }
          } catch (e) {
            // 忽略解析错误
          }
        } else if (msgType === "state") {
          const state = data.state || {};
          if (!state.inProgress && receivedUpdate) {
            if (inThinkingBlock) {
              yield encoder.encode(createSSEChunk(requestId, model, "]]\n\n"));
              inThinkingBlock = false;
            }
            break;
          }
        }
      } catch (e) {
        // 忽略解析错误
      }
    }

    ws.close();

    yield encoder.encode(createSSEChunk(requestId, model, "", "stop"));
    yield encoder.encode("data: [DONE]\n\n");
  } catch (e) {
    console.error(`流式处理异常: ${e}`);
    yield encoder.encode(createSSEChunk(requestId, model, `错误: ${e}`, "stop"));
    yield encoder.encode("data: [DONE]\n\n");
  }
}

async function* wsMessageIterator(
  ws: WebSocket
): AsyncGenerator<{ type: "message"; data: string } | { type: "close" } | { type: "error"; error: Event }> {
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

async function nonStreamChat(
  requestId: string,
  model: string,
  userId: string,
  fullPrompt: string
): Promise<string> {
  const wsUrl = `wss://api.bytez.com/models/v2/openai/v1/completions/stream?token=${userId}`;
  let fullContent = "";

  try {
    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => {
        console.log(`WebSocket 已连接 (非流式): ${userId}`);
        resolve();
      };
      ws.onerror = (e) => reject(e);
    });

    const payload = {
      prompt: fullPrompt,
      model,
      temperature: 0.7,
      max_tokens: 150,
    };
    const headers = {
      Authorization: `Bearer BYTEZ_KEY`, // 直接使用 BYTEZ_KEY 认证
      "Content-Type": "application/json",
    };

    const resp = await fetch(`${BASE_URL}`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    console.log(`POST /completions 状态: ${resp.status}`);

    let receivedUpdate = false;
    let lastBufferType: string | null = null;
    let inThinkingBlock = false;
    const modeByType: Record<string, "snapshot" | "delta"> = {};
    const prevContentByType: Record<string, string> = {};

    for await (const event of wsMessageIterator(ws)) {
      if (event.type === "close") break;
      if (event.type === "error") {
        console.error("WebSocket 错误:", event.error);
        break;
      }

      try {
        const data = JSON.parse(event.data);
        const msgType = data.type;

        if (msgType === "update") {
          receivedUpdate = true;
          const bufferStr = data.buffer || "{}";
          try {
            const bufferData = JSON.parse(bufferStr);
            const bufferType = bufferData.type;

            if (bufferType === "completion") {
              const content = bufferData.completion?.text || "";
              console.log(`提取到内容 (非流式, ${bufferType})，长度: ${content.length}`);

              if (bufferType !== lastBufferType) {
                if (inThinkingBlock) {
                  fullContent += "]]\n\n";
                  inThinkingBlock = false;
                }
                if (bufferType === "thinking") {
                  fullContent += " ";
                  inThinkingBlock = true;
                }
                lastBufferType = bufferType;
              }

              const prev = prevContentByType[bufferType] ?? "";
              let mode = modeByType[bufferType];
              let delta = "";
              if (!mode && prev) {
                if (content.startsWith(prev)) {
                  mode = "snapshot";
                  modeByType[bufferType] = mode;
                } else {
                  mode = "delta";
                  modeByType[bufferType] = mode;
                }
              }
              if (mode === "snapshot") {
                delta = content.slice(prev.length);
                prevContentByType[bufferType] = content;
              } else if (mode === "delta") {
                delta = content;
                prevContentByType[bufferType] = prev + content;
              } else {
                delta = content;
                prevContentByType[bufferType] = content;
              }

              if (delta) {
                fullContent += delta;
              }
            }
          } catch (e) {
            console.warn(`解析 buffer 失败 (非流式): ${e}`);
          }
        } else if (msgType === "state") {
          const state = data.state || {};
          console.log(`收到 state 消息 (非流式): inProgress=${state.inProgress}`);
          if (!state.inProgress) {
            if (receivedUpdate) {
              if (inThinkingBlock) {
                fullContent += "]]\n\n";
                inThinkingBlock = false;
              }
              console.log("已收到 update 消息，任务完成 (非流式)");
              break;
            } else {
              console.log("尚未收到 update 消息 (非流式)，继续等待...");
            }
          }
        }
      } catch (e) {
        // 忽略解析错误
      }
    }

    ws.close();
    return fullContent;
  } catch (e) {
    console.error(`非流式处理错误: ${e}`);
    throw new Error(`处理请求失败: ${e}`);
  }
}

const router = new Router();

router.post("/v1/completions", async (ctx) => {
  const authorization = ctx.request.headers.get("authorization");
  if (!authorization || !authorization.startsWith("BYTEZ_KEY ")) {
    ctx.response.status = 401;
    ctx.response.body = { error: "需要 BYTEZ_KEY 认证" };
    return;
  }

  const requestData: CompletionRequest;
  try {
    requestData = await ctx.request.body({ type: "json" }).value;
  } catch (e) {
    ctx.response.status = 400;
    ctx.response.body = { error: `无效的 JSON: ${e}` };
    return;
  }

  const model = requestData.model || "openai-community/gpt2";
  const prompt = requestData.prompt || "";
  const temperature = requestData.temperature || 0.7;
  const max_tokens = requestData.max_tokens || 150;
  const stream = requestData.stream || false;

  if (!prompt.trim()) {
    ctx.response.status = 400;
    ctx.response.body = { error: "prompt 不能为空" };
    return;
  }

  const userId = "default_user_id"; // 直接使用默认用户 ID（无需 JWT）
  const requestId = `completion-${crypto.randomUUID()}`;

  if (stream) {
    ctx.response.headers.set("Content-Type", "text/event-stream; charset=utf-8");
    ctx.response.headers.set("Cache-Control", "no-cache");
    ctx.response.headers.set("Connection", "keep-alive");
    ctx.response.headers.set("X-Accel-Buffering", "no");

    const body = streamChatGenerator(requestId, model, userId, prompt);
    ctx.response.body = body;
  } else {
    try {
      const fullContent = await nonStreamChat(requestId, model, userId, prompt);
      ctx.response.body = createCompletionResponse(requestId, model, fullContent);
    } catch (e) {
      ctx.response.status = 500;
      ctx.response.body = { error: `处理请求失败: ${e}` };
    }
  }
});

router.get("/v1/models", (ctx) => {
  const models = [
    { id: "openai-community/gpt2", object: "model", created: 1234567890, owned_by: "bytez" },
  ];
  ctx.response.body = { object: "list", data: models };
});

router.get("/", (ctx) => {
  ctx.response.body = {
    status: "ok",
    service: "bytez-openai-proxy",
    version: "1.0.0",
  };
});

const app = new Application();

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

const port = 8000;
console.log(`🚀 服务器运行在 http://localhost:${port}`);
console.log(`📚 Bytez-OpenAI-Proxy v1.0.0`);
await app.listen({ port });
