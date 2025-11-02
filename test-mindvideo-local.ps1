# MindVideo API 本地测试脚本
# 使用你提供的真实数据进行测试

$BASE_URL = "https://api.mindvideo.ai"
$AUTH_TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJodHRwczovL2FwaS5taW5kdmlkZW8uYWkvYXBpL3JlZnJlc2giLCJpYXQiOjE3NjEzMTA5NzksImV4cCI6MTc2MjA4MTE4NSwibmJmIjoxNzYyMDczOTg1LCJqdGkiOiJUaFQzZWdXVmRxQlhxWmdFIiwic3ViIjoiMzIyMTI0IiwicHJ2IjoiMjNiZDVjODk0OWY2MDBhZGIzOWU3MDFjNDAwODcyZGI3YTU5NzZmNyIsInVpZCI6MzIyMTI0LCJlbWFpbCI6ImFpbHNkMTFAT3V0bG9vay5jb20iLCJpc05ldyI6ZmFsc2V9.HAswzMIG4-01XoDWlgY0o8euwzYFzCiTTUBhFvAj03E"

# 通用请求头
$headers = @{
    "accept" = "application/json, text/plain, */*"
    "accept-language" = "zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6"
    "authorization" = "Bearer $AUTH_TOKEN"
    "content-type" = "application/json"
    "i-lang" = "zh-CN"
    "i-version" = "1.0.8"
    "origin" = "https://www.mindvideo.ai"
    "priority" = "u=1, i"
    "referer" = "https://www.mindvideo.ai/"
    "user-agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
}

# 测试1: 查询用户积分状态
Write-Host "=== 测试1: 查询用户积分状态 ===" -ForegroundColor Green

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/user/credits/stats" -Method Get -Headers $headers
    Write-Host "积分状态响应:" -ForegroundColor Yellow
    $response | ConvertTo-Json -Depth 3
} catch {
    Write-Host "错误: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n"

# 测试2: 创建视频生成任务 - 使用你提供的真实数据
Write-Host "=== 测试2: 创建视频生成任务 ===" -ForegroundColor Green

$body = @{
    type = 1
    bot_id = 153
    options = @{
        prompt = "小黄鱼游动"
        size = "720x1280"
        seconds = 15
        history_images = @()
    }
    is_public = $true
    copy_protection = $false
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/v2/creations" -Method Post -Headers $headers -Body $body
    Write-Host "创建任务响应:" -ForegroundColor Yellow
    $response | ConvertTo-Json -Depth 3
    
    # 保存任务ID用于后续查询
    if ($response.data -and $response.data.id) {
        $taskId = $response.data.id
        Write-Host "任务ID: $taskId" -ForegroundColor Cyan
        
        # 保存任务ID到文件，方便后续使用
        $taskId | Out-File -FilePath "task_id.txt" -Encoding UTF8
    }
} catch {
    Write-Host "错误: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n"

# 测试3: 查询已知任务进度 - 使用你提供的任务ID
Write-Host "=== 测试3: 查询已知任务进度 ===" -ForegroundColor Green

# 使用你提供的已知任务ID
$knownTaskId = 2040868

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/v2/creations/task_progress?ids[]=$knownTaskId" -Method Get -Headers $headers
    Write-Host "任务进度响应:" -ForegroundColor Yellow
    $response | ConvertTo-Json -Depth 3
    
    # 提取视频URL
    if ($response.data -and $response.data.length -gt 0) {
        $taskData = $response.data[0]
        if ($taskData.results -and $taskData.results.length -gt 0) {
            Write-Host "=== 生成的视频链接 ===" -ForegroundColor Magenta
            foreach ($result in $taskData.results) {
                Write-Host "视频URL: $($result.result_url)" -ForegroundColor Green
                Write-Host "封面URL: $($result.cover_url)" -ForegroundColor Cyan
                Write-Host "时长: $($result.duration)秒" -ForegroundColor Yellow
                Write-Host ""
            }
        }
    }
} catch {
    Write-Host "错误: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== 测试完成 ===" -ForegroundColor Cyan

# 额外的测试函数
Write-Host "`n=== 额外功能: 测试不同提示词 ===" -ForegroundColor Green

# 测试不同的提示词
$prompts = @(
    "美丽的日落山脉",
    "城市夜景灯光",
    "海洋生物游动",
    "太空飞船飞行"
)

foreach ($prompt in $prompts) {
    Write-Host "测试提示词: $prompt" -ForegroundColor Yellow
    
    $testBody = @{
        type = 1
        bot_id = 153
        options = @{
            prompt = $prompt
            size = "720x1280"
            seconds = 15
            history_images = @()
        }
        is_public = $true
        copy_protection = $false
    } | ConvertTo-Json
    
    try {
        $testResponse = Invoke-RestMethod -Uri "$BASE_URL/api/v2/creations" -Method Post -Headers $headers -Body $testBody
        Write-Host "  状态: 成功 (任务ID: $($testResponse.data.id))" -ForegroundColor Green
    } catch {
        Write-Host "  状态: 失败 - $($_.Exception.Message)" -ForegroundColor Red
    }
    
    Start-Sleep -Seconds 1  # 避免请求过快
}

Write-Host "`n=== 所有测试完成 ===" -ForegroundColor Cyan