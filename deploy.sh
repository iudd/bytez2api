#!/bin/bash

echo "🚀 开始部署 Bytez2API 到 Deno..."

# 检查 server.ts 文件是否存在
if [ ! -f "server.ts" ]; then
    echo "❌ 错误: server.ts 文件不存在"
    exit 1
fi

# 验证代码修复
if grep -q "const requestData: CompletionRequest;" server.ts; then
    echo "❌ 错误: 代码仍然包含未修复的 const 声明"
    echo "正在修复代码..."
    sed -i 's/const requestData: CompletionRequest;/let requestData: CompletionRequest;/g' server.ts
    echo "✅ 代码已修复"
fi

# 运行 Deno 检查
echo "🔍 检查 Deno 代码语法..."
deno check server.ts

if [ $? -eq 0 ]; then
    echo "✅ 代码语法检查通过"
    echo "🚀 启动 Deno 服务器..."
    deno run --allow-net --allow-env server.ts
else
    echo "❌ 代码语法检查失败"
    exit 1
fi