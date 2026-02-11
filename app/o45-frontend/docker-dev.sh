#!/bin/bash
# 开发模式启动脚本

echo "🚀 启动开发模式（支持热更新）..."
echo "📍 访问地址: http://localhost:8088"
echo ""

docker compose --profile dev up

