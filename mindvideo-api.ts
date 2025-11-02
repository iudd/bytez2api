/**
 * MindVideo API 转换器 - 高级版本
 * 支持多token管理、账号轮询、智能负载均衡
 * 将 OpenAI 兼容的视频生成 API 转换为 MindVideo 的 API
 * 
 * 🚀 功能特性：
 * 1. 多token轮询管理，避免拥堵
 * 2. 账号状态监控和智能分配
 * 3. 超时优化和重试机制
 * 4. 详细的视频生成反馈
 */

import { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";

const app = new Application();
const router = new Router();

// MindVideo API 端点
const MINDVIDEO_BASE_URL = "https://api.mindvideo.ai";

// 多token管理 - 从环境变量获取，支持多个账号
const MINDVIDEO_TOKENS = (Deno.env.get("MINDVIDEO_TOKENS") || 
  "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJodHRwczovL2FwaS5taW5kdmlkZW8uYWkvYXBpL3JlZnJlc2giLCJpYXQiOjE3NjEzMTA5NzksImV4cCI6MTc2MjA4MTE4NSwibmJmIjoxNzYyMDczOTg1LCJqdGkiOiJUaFQzZWdXVmRxQlhxWmdFIiwic3ViIjoiMzIyMTI0IiwicHJ2IjoiMjNiZDVjODk0OWY2MDBhZGIzOWU3MDFjNDAwODcyZGI3YTU5NzZmNyIsInVpZCI6MzIyMTI0LCJlbWFpbCI6ImFpbHNkMTFAT3V0bG9vay5jb20iLCJpc05ldyI6ZmFsc2V9.HAswzMIG4-01XoDWlgY0o8euwzYFzCiTTUBhFvAj03E").split(",");

// 账号状态管理
interface AccountStatus {
  token: string;
  userId: number;
  isActive: boolean;
  lastUsed: number;
  queueCount: number;
  successCount: number;
  errorCount: number;
}

// 初始化账号状态
let accounts: AccountStatus[] = MINDVIDEO_TOKENS.map(token => ({
  token,
  userId: 0,
  isActive: true,
  lastUsed: 0,
  queueCount: 0,
  successCount: 0,
  errorCount: 0
}));

// 任务状态管理
interface TaskInfo {
  taskId: number;
  accountIndex: number;
  prompt: string;
  startTime: number;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  videoUrl?: string;
  coverUrl?: string;
  duration?: number;
}

const activeTasks = new Map<number, TaskInfo>();

// 获取最佳可用账号（负载均衡）
function getBestAccount(): AccountStatus | null {
  const now = Date.now();
  const availableAccounts = accounts.filter(acc => 
    acc.isActive && acc.queueCount < 3 && (now - acc.lastUsed) > 30000
  );
  
  if (availableAccounts.length === 0) return null;
  
  // 选择队列最少的账号
  return availableAccounts.reduce((best, current) => 
    current.queueCount < best.queueCount ? current : best
  );
}

// 查询账号状态
async function checkAccountStatus(account: AccountStatus): Promise<boolean> {
  try {
    const response = await fetch(`${MINDVIDEO_BASE_URL}/api/user/credits/stats`, {
      headers: {
        "Authorization": `Bearer ${account.token}`,
        "Content-Type": "application/json"
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      account.userId = data.data?.user_id || 0;
      account.isActive = true;
      return true;
    }
  } catch (error) {
    console.error(`账号 ${account.userId} 状态检查失败:`, error);
  }
  
  account.isActive = false;
  return false;
}

// 定期检查所有账号状态
async function monitorAccounts() {
  for (const account of accounts) {
    await checkAccountStatus(account);
    await new Promise(resolve => setTimeout(resolve, 1000)); // 避免请求过快
  }
}

// 启动账号监控
setInterval(monitorAccounts, 60000); // 每分钟检查一次

interface VideoGenerationRequest {
  model?: string;
  prompt: string;
  size?: string;
  seconds?: number;
  n?: number;
}

interface TaskStatusResponse {
  code: number;
  message: string;
  data: Array<{
    id: number;
    user_id: number;
    bot_id: number;
    bot: {
      id: number;
      name: string;
      level: string;
      options: Array<{
        type: string;
        title: string;
        fillRule?: {
          required: boolean;
          maxLength: number;
          minLength: number;
        };
        identifier: string;
        placeholder?: string;
        options?: Array<{
          label: string;
          value: string | number;
        }>;
        description?: string;
      }>;
      is_enable: boolean;
    };
    model: {
      id: number;
      name: string;
      model_key: string;
    };
    model_id: number;
    type: number;
    category: string;
    prompt: string;
    options: {
      size: string;
      prompt: string;
      seconds: number;
      history_images: any[];
    };
    cover_url: string | null;
    task_progress: number;
    task_id: string;
    task_status: string;
    updated_at: string;
    created_at: string;
    results_count: number;
    task_remark: string;
    results: Array<{
      id: number;
      creation_id: number;
      ratio: string | null;
      cover_url: string;
      resolution: string | null;
      duration: number;
      result_url: string;
    }>;
    effect_template: any;
    relation_map: {
      image_keys: any[];
      video_keys: any[];
      aspect_ratio_keys: string[];
      resolution_keys: any[];
      duration_keys: string[];
    };
    queue_count: number;
    generate_duration: number;
  }>;
  timestamp: number;
}

// 健康检查
router.get("/", (ctx) => {
  ctx.response.body = {
    status: "ok",
    service: "mindvideo-api-proxy",
    version: "1.0.0",
    message: "MindVideo API 转换器运行正常"
  };
});

// 获取模型列表
router.get("/v1/models", (ctx) => {
  const models = [
    { 
      id: "sora-2-free", 
      object: "model", 
      created: 1234567890, 
      owned_by: "mindvideo" 
    },
    { 
      id: "t-sora2", 
      object: "model", 
      created: 1234567890, 
      owned_by: "mindvideo" 
    },
  ];
  ctx.response.body = { object: "list", data: models };
});

// 创建视频生成任务
async function createVideoTask(account: AccountStatus, prompt: string, size: string, seconds: number): Promise<number | null> {
  try {
    const response = await fetch(`${MINDVIDEO_BASE_URL}/api/v2/creations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${account.token}`,
        "i-lang": "zh-CN",
        "i-version": "1.0.8",
        "Origin": "https://www.mindvideo.ai",
        "Referer": "https://www.mindvideo.ai/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      },
      body: JSON.stringify({
        type: 1,
        bot_id: 153,
        options: {
          prompt: prompt,
          size: size,
          seconds: seconds,
          history_images: []
        },
        is_public: true,
        copy_protection: false
      })
    });

    if (!response.ok) {
      account.errorCount++;
      return null;
    }

    const result = await response.json();
    if (result.data && result.data.id) {
      account.queueCount++;
      account.lastUsed = Date.now();
      return result.data.id;
    }
    
    account.errorCount++;
    return null;
  } catch (error) {
    console.error("创建任务失败:", error);
    account.errorCount++;
    return null;
  }
}

// 轮询任务状态（智能超时处理）
async function pollTaskStatus(account: AccountStatus, taskId: number, prompt: string): Promise<TaskInfo | null> {
  const startTime = Date.now();
  const maxDuration = 300000; // 5分钟最大等待时间
  const taskInfo: TaskInfo = {
    taskId,
    accountIndex: accounts.indexOf(account),
    prompt,
    startTime,
    status: "processing",
    progress: 0
  };

  activeTasks.set(taskId, taskInfo);

  while (Date.now() - startTime < maxDuration) {
    try {
      const response = await fetch(
        `${MINDVIDEO_BASE_URL}/api/v2/creations/task_progress?ids[]=${taskId}`,
        {
          headers: {
            "Authorization": `Bearer ${account.token}`,
            "i-lang": "zh-CN",
            "i-version": "1.0.8",
            "Origin": "https://www.mindvideo.ai",
            "Referer": "https://www.mindvideo.ai/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
          }
        }
      );

      if (response.ok) {
        const statusData: TaskStatusResponse = await response.json();
        
        if (statusData.data && statusData.data.length > 0) {
          const taskData = statusData.data[0];
          taskInfo.progress = taskData.task_progress;
          
          console.log(`任务 ${taskId} 进度: ${taskInfo.progress}% - 状态: ${taskData.task_status}`);
          
          if (taskData.task_progress === 100 && taskData.task_status === "completed") {
            // 任务完成
            taskInfo.status = "completed";
            taskInfo.videoUrl = taskData.results?.[0]?.result_url;
            taskInfo.coverUrl = taskData.results?.[0]?.cover_url;
            taskInfo.duration = taskData.results?.[0]?.duration;
            
            account.queueCount--;
            account.successCount++;
            activeTasks.delete(taskId);
            
            console.log(`✅ 任务 ${taskId} 完成，视频URL: ${taskInfo.videoUrl}`);
            return taskInfo;
          }
          
          if (taskData.task_status === "failed") {
            // 任务失败
            taskInfo.status = "failed";
            account.queueCount--;
            account.errorCount++;
            activeTasks.delete(taskId);
            
            console.log(`❌ 任务 ${taskId} 失败`);
            return null;
          }
        }
      }
      
      // 智能等待：根据进度调整轮询间隔
      const waitTime = taskInfo.progress < 50 ? 5000 : 10000; // 进度慢时5秒，进度快时10秒
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
    } catch (error) {
      console.error(`轮询任务 ${taskId} 状态失败:`, error);
      await new Promise(resolve => setTimeout(resolve, 10000)); // 出错时等待10秒
    }
  }

  // 超时处理
  taskInfo.status = "failed";
  account.queueCount--;
  account.errorCount++;
  activeTasks.delete(taskId);
  
  console.log(`⏰ 任务 ${taskId} 处理超时`);
  return null;
}

// 视频生成 API（多token智能管理）
router.post("/v1/videos/generations", async (ctx) => {
  try {
    // 解析请求
    let requestData: VideoGenerationRequest;
    try {
      requestData = await ctx.request.body({ type: "json" }).value;
    } catch (e) {
      ctx.response.status = 400;
      ctx.response.body = { error: `无效的 JSON: ${e}` };
      return;
    }

    const prompt = requestData.prompt || "";
    const n = requestData.n || 1;
    const size = requestData.size || "720x1280";
    const seconds = requestData.seconds || 15;

    if (!prompt.trim()) {
      ctx.response.status = 400;
      ctx.response.body = { error: "prompt 不能为空" };
      return;
    }

    // 验证尺寸格式
    const validSizes = ["720x1280", "1280x720"];
    if (!validSizes.includes(size)) {
      ctx.response.status = 400;
      ctx.response.body = { 
        error: "无效的尺寸格式",
        supported_sizes: validSizes,
        message: "请使用 720x1280 (9:16) 或 1280x720 (16:9)"
      };
      return;
    }

    // 获取最佳可用账号
    const account = getBestAccount();
    if (!account) {
      ctx.response.status = 503;
      ctx.response.body = { 
        error: "服务暂时不可用",
        message: "所有账号都在忙碌中，请稍后重试",
        available_accounts: accounts.filter(a => a.isActive).length,
        total_accounts: accounts.length
      };
      return;
    }

    console.log(`🎯 使用账号 ${account.userId} 创建任务，提示词: ${prompt.substring(0, 50)}...`);

    // 创建任务
    const taskId = await createVideoTask(account, prompt, size, seconds);
    if (!taskId) {
      ctx.response.status = 500;
      ctx.response.body = { error: "创建视频生成任务失败" };
      return;
    }

    console.log(`📝 任务创建成功，ID: ${taskId}`);

    // 异步轮询任务状态
    const taskResult = await pollTaskStatus(account, taskId, prompt);
    
    if (taskResult && taskResult.status === "completed") {
      // 成功返回详细视频信息
      ctx.response.body = {
        created: Math.floor(Date.now() / 1000),
        data: [{
          url: taskResult.videoUrl,
          cover_url: taskResult.coverUrl,
          duration: taskResult.duration,
          revised_prompt: prompt,
          task_id: taskId,
          account_id: account.userId,
          processing_time: Date.now() - taskResult.startTime
        }],
        usage: {
          prompt_tokens: prompt.length,
          total_tokens: prompt.length,
          account_used: account.userId
        }
      };
    } else {
      // 失败处理
      ctx.response.status = 500;
      ctx.response.body = { 
        error: "视频生成失败",
        task_id: taskId,
        message: "任务处理过程中出现错误或超时"
      };
    }
    
  } catch (error) {
    console.error("视频生成错误:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "内部服务器错误" };
  }
});

// 账号状态监控API
router.get("/v1/accounts/status", (ctx) => {
  const accountStatus = accounts.map((acc, index) => ({
    index,
    userId: acc.userId,
    isActive: acc.isActive,
    queueCount: acc.queueCount,
    successCount: acc.successCount,
    errorCount: acc.errorCount,
    lastUsed: new Date(acc.lastUsed).toISOString()
  }));
  
  ctx.response.body = {
    total_accounts: accounts.length,
    active_accounts: accounts.filter(a => a.isActive).length,
    total_queue: accounts.reduce((sum, acc) => sum + acc.queueCount, 0),
    accounts: accountStatus
  };
});

// 任务状态查询API
router.get("/v1/tasks/:taskId", (ctx) => {
  const taskId = parseInt(ctx.params.taskId);
  const taskInfo = activeTasks.get(taskId);
  
  if (!taskInfo) {
    ctx.response.status = 404;
    ctx.response.body = { error: "任务不存在或已完成" };
    return;
  }
  
  ctx.response.body = {
    task_id: taskInfo.taskId,
    prompt: taskInfo.prompt,
    status: taskInfo.status,
    progress: taskInfo.progress,
    start_time: new Date(taskInfo.startTime).toISOString(),
    elapsed_time: Date.now() - taskInfo.startTime,
    account_index: taskInfo.accountIndex
  };
});

// 配置路由
app.use(router.routes());
app.use(router.allowedMethods());

// 启动服务器
const PORT = 8000;
console.log(`🚀 MindVideo API 高级转换器启动成功`);
console.log(`📍 服务地址: http://localhost:${PORT}`);
console.log(`📊 账号管理: ${accounts.length} 个账号已加载`);
console.log(`⚡ 智能特性: 多token轮询、负载均衡、智能超时`);
console.log(`📈 监控接口: http://localhost:${PORT}/v1/accounts/status`);
console.log(`🔍 任务查询: http://localhost:${PORT}/v1/tasks/{taskId}`);

// 启动时检查所有账号状态
await monitorAccounts();

await app.listen({ port: PORT });