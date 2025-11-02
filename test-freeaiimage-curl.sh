#!/bin/bash

# FreeAIImage 网站模型测试脚本
# 使用 curl 命令测试 https://freeaiimage.net/zh/ 支持的模型

FREEAI_BASE_URL="https://freeaiimage.net"

# 测试1: 创建图像生成任务
echo "=== 测试1: 创建图像生成任务 ==="
curl -X POST "$FREEAI_BASE_URL/api/services/create-qwen-image" \
  -H "Content-Type: application/json" \
  -H "Origin: $FREEAI_BASE_URL" \
  -H "Referer: $FREEAI_BASE_URL/zh/" \
  -d '{
    "prompt": "美丽的日落山脉风景",
    "width": 750,
    "height": 1000,
    "batch_size": 2,
    "negative_prompt": "模糊，变形，畸形"
  }'

echo -e "\n\n"

# 测试2: 获取任务状态（需要替换为实际的任务ID）
echo "=== 测试2: 获取任务状态 ==="
# 请将下面的 TASK_ID 替换为上面测试返回的实际任务ID
TASK_ID="019a3f7a-331a-7000-a876-75776d776ec1"
curl -X GET "$FREEAI_BASE_URL/api/services/aigc/task?taskId=$TASK_ID&taskType=qwen_image" \
  -H "Origin: $FREEAI_BASE_URL" \
  -H "Referer: $FREEAI_BASE_URL/zh/"

echo -e "\n\n"

# 测试3: 测试网站首页（检查可用性）
echo "=== 测试3: 网站首页检查 ==="
curl -I "$FREEAI_BASE_URL/zh/"

echo -e "\n=== 测试完成 ==="