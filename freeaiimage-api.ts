/**
 * FreeAIImage API 转换器
 * 将 OpenAI 兼容的图像生成 API 转换为 FreeAIImage 的 API
 * Deno 版本
 */

import { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";

const app = new Application();
const router = new Router();

// FreeAIImage API 端点
const FREEAI_BASE_URL = "https://freeaiimage.net";

interface ImageGenerationRequest {
  model?: string;
  prompt: string;
  size?: string;
  quality?: string;
  n?: number;
}

interface TaskStatusResponse {
  id: number;
  user_id: number;
  task_id: string;
  task_type: string;
  status: "pending" | "processing" | "completed" | "failed";
  params: {
    width: number;
    height: number;
    prompt: string;
    batch_size: number;
    negative_prompt: string;
  };
  data: string[] | null;
  data1: string | null;
  data2: string | null;
  priority: number;
  created_at: string;
}

// 健康检查
router.get("/", (ctx) => {
  ctx.response.body = {
    status: "ok",
    service: "freeaiimage-api-proxy",
    version: "1.0.0",
    message: "FreeAIImage API 转换器运行正常"
  };
});

// 获取模型列表
router.get("/v1/models", (ctx) => {
  const models = [
    { 
      id: "qwen-image", 
      object: "model", 
      created: 1234567890, 
      owned_by: "freeaiimage" 
    },
    { 
      id: "dall-e-3", 
      object: "model", 
      created: 1234567890, 
      owned_by: "freeaiimage" 
    },
  ];
  ctx.response.body = { object: "list", data: models };
});

// 图像生成 API
router.post("/v1/images/generations", async (ctx) => {
  try {
    // 解析请求
    let requestData: ImageGenerationRequest;
    try {
      requestData = await ctx.request.body({ type: "json" }).value;
    } catch (e) {
      ctx.response.status = 400;
      ctx.response.body = { error: `无效的 JSON: ${e}` };
      return;
    }

    const prompt = requestData.prompt || "";
    const n = requestData.n || 1;
    const size = requestData.size || "1024x1024";

    if (!prompt.trim()) {
      ctx.response.status = 400;
      ctx.response.body = { error: "prompt 不能为空" };
      return;
    }

    // 解析尺寸
    const [width, height] = size.split("x").map(Number);
    if (!width || !height) {
      ctx.response.status = 400;
      ctx.response.body = { error: "无效的尺寸格式，请使用 '宽x高' 格式" };
      return;
    }

    // 创建任务
    const createTaskResponse = await fetch(`${FREEAI_BASE_URL}/api/services/create-qwen-image`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": FREEAI_BASE_URL,
        "Referer": `${FREEAI_BASE_URL}/zh/`,
      },
      body: JSON.stringify({
        prompt: prompt,
        width: width,
        height: height,
        batch_size: Math.min(n, 4), // 限制最大为4张
        negative_prompt: "模糊，变形，畸形"
      })
    });

    if (!createTaskResponse.ok) {
      ctx.response.status = 500;
      ctx.response.body = { error: "创建图像生成任务失败" };
      return;
    }

    const createResult = await createTaskResponse.json();
    if (!createResult.success || !createResult.task_id) {
      ctx.response.status = 500;
      ctx.response.body = { error: "任务创建响应异常" };
      return;
    }

    const taskId = createResult.task_id;
    console.log(`创建图像生成任务成功，任务ID: ${taskId}`);

    // 轮询任务状态
    let attempts = 0;
    const maxAttempts = 30; // 最大尝试次数（约30秒）
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // 每秒检查一次
      
      const statusResponse = await fetch(
        `${FREEAI_BASE_URL}/api/services/aigc/task?taskId=${taskId}&taskType=qwen_image`,
        {
          headers: {
            "Origin": FREEAI_BASE_URL,
            "Referer": `${FREEAI_BASE_URL}/zh/`,
          }
        }
      );

      if (!statusResponse.ok) {
        attempts++;
        continue;
      }

      const statusData: TaskStatusResponse = await statusResponse.json();
      
      if (statusData.status === "completed") {
        // 任务完成，返回图像URL
        const images = statusData.data || [];
        ctx.response.body = {
          created: Math.floor(Date.now() / 1000),
          data: images.map((url, index) => ({
            url: url,
            revised_prompt: prompt
          }))
        };
        return;
      } else if (statusData.status === "failed") {
        ctx.response.status = 500;
        ctx.response.body = { error: "图像生成失败" };
        return;
      }
      // 如果是 processing 或 pending，继续等待
      
      attempts++;
    }

    // 超时
    ctx.response.status = 408;
    ctx.response.body = { error: "图像生成超时" };

  } catch (error) {
    console.error("处理图像生成请求错误:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal Server Error" };
  }
});

// 流式图像生成状态 API（可选）
router.post("/v1/images/generations/stream", async (ctx) => {
  try {
    let requestData: ImageGenerationRequest;
    try {
      requestData = await ctx.request.body({ type: "json" }).value;
    } catch (e) {
      ctx.response.status = 400;
      ctx.response.body = { error: `无效的 JSON: ${e}` };
      return;
    }

    const prompt = requestData.prompt || "";
    const n = requestData.n || 1;
    const size = requestData.size || "1024x1024";

    if (!prompt.trim()) {
      ctx.response.status = 400;
      ctx.response.body = { error: "prompt 不能为空" };
      return;
    }

    const [width, height] = size.split("x").map(Number);
    if (!width || !height) {
      ctx.response.status = 400;
      ctx.response.body = { error: "无效的尺寸格式" };
      return;
    }

    // 创建任务
    const createTaskResponse = await fetch(`${FREEAI_BASE_URL}/api/services/create-qwen-image`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": FREEAI_BASE_URL,
        "Referer": `${FREEAI_BASE_URL}/zh/`,
      },
      body: JSON.stringify({
        prompt: prompt,
        width: width,
        height: height,
        batch_size: Math.min(n, 4),
        negative_prompt: "模糊，变形，畸形"
      })
    });

    if (!createTaskResponse.ok) {
      ctx.response.status = 500;
      ctx.response.body = { error: "创建任务失败" };
      return;
    }

    const createResult = await createTaskResponse.json();
    if (!createResult.success || !createResult.task_id) {
      ctx.response.status = 500;
      ctx.response.body = { error: "任务创建响应异常" };
      return;
    }

    const taskId = createResult.task_id;

    // 设置流式响应
    ctx.response.headers.set("Content-Type", "text/event-stream; charset=utf-8");
    ctx.response.headers.set("Cache-Control", "no-cache");
    ctx.response.headers.set("Connection", "keep-alive");

    const encoder = new TextEncoder();
    const body = new ReadableStream({
      async start(controller) {
        let attempts = 0;
        const maxAttempts = 30;
        
        while (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const statusResponse = await fetch(
            `${FREEAI_BASE_URL}/api/services/aigc/task?taskId=${taskId}&taskType=qwen_image`,
            {
              headers: {
                "Origin": FREEAI_BASE_URL,
                "Referer": `${FREEAI_BASE_URL}/zh/`,
              }
            }
          );

          if (statusResponse.ok) {
            const statusData: TaskStatusResponse = await statusResponse.json();
            
            // 发送状态更新
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              status: statusData.status,
              progress: Math.min((attempts / maxAttempts) * 100, 100),
              task_id: taskId
            })}\n\n`));

            if (statusData.status === "completed") {
              const images = statusData.data || [];
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                status: "completed",
                images: images.map(url => ({ url, revised_prompt: prompt }))
              })}\n\n`));
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
              return;
            } else if (statusData.status === "failed") {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                status: "failed",
                error: "图像生成失败"
              })}\n\n`));
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
              return;
            }
          }
          
          attempts++;
        }

        // 超时
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          status: "timeout",
          error: "图像生成超时"
        })}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    });
    
    ctx.response.body = body;

  } catch (error) {
    console.error("处理流式图像生成请求错误:", error);
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
const port = 8001;
console.log(`🚀 FreeAIImage API 转换器运行在 http://localhost:${port}`);
console.log(`📚 支持 OpenAI 兼容的图像生成 API`);
await app.listen({ port });