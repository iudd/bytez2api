# FreeAIImage Website Test Script
# PowerShell version - Test models supported by https://freeaiimage.net/zh/

$FREEAI_BASE_URL = "https://freeaiimage.net"

# Test 1: Create image generation task
Write-Host "=== Test 1: Create Image Generation Task ===" -ForegroundColor Green

$body1 = @{
    prompt = "Beautiful sunset over mountains"
    width = 750
    height = 1000
    batch_size = 2
    negative_prompt = "blurry, distorted, deformed"
} | ConvertTo-Json

$headers1 = @{
    "Content-Type" = "application/json"
    "Origin" = $FREEAI_BASE_URL
    "Referer" = "$FREEAI_BASE_URL/zh/"
}

try {
    $response1 = Invoke-RestMethod -Uri "$FREEAI_BASE_URL/api/services/create-qwen-image" -Method Post -Headers $headers1 -Body $body1
    Write-Host "Task Creation Response:" -ForegroundColor Yellow
    $response1 | ConvertTo-Json -Depth 3
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n"

# Test 2: Get task status (replace with actual task ID)
Write-Host "=== Test 2: Get Task Status ===" -ForegroundColor Green

# Replace TASK_ID below with actual task ID from above test
$TASK_ID = "019a3f7a-331a-7000-a876-75776d776ec1"

$headers2 = @{
    "Origin" = $FREEAI_BASE_URL
    "Referer" = "$FREEAI_BASE_URL/zh/"
}

try {
    $url = "$FREEAI_BASE_URL/api/services/aigc/task?taskId=$TASK_ID&taskType=qwen_image"
    $response2 = Invoke-RestMethod -Uri $url -Method Get -Headers $headers2
    Write-Host "Task Status Response:" -ForegroundColor Yellow
    $response2 | ConvertTo-Json -Depth 3
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n"

# Test 3: Test website homepage (check availability)
Write-Host "=== Test 3: Website Homepage Check ===" -ForegroundColor Green

try {
    $response3 = Invoke-WebRequest -Uri "$FREEAI_BASE_URL/zh/" -Method Head
    Write-Host "Website Status Code: $($response3.StatusCode)" -ForegroundColor Yellow
    Write-Host "Website Status Description: $($response3.StatusDescription)" -ForegroundColor Yellow
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== Test Completed ===" -ForegroundColor Cyan