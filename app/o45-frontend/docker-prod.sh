#!/bin/bash
# 生产模式启动脚本

echo "🏗️  构建并启动生产模式..."
echo "📍 访问地址: http://localhost:3000"
echo ""

docker compose --profile prod up --build

