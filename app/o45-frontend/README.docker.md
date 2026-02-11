# Docker 部署指南

## 快速开始

### 方式一：开发模式（推荐用于开发，支持热更新）

```bash
# 启动开发服务器
docker compose --profile dev up

# 或者后台运行
docker compose --profile dev up -d

# 访问地址
http://localhost:8088
```

**特点：**
- ✅ 支持热更新（修改代码自动刷新）
- ✅ 代码挂载到容器（无需重新构建）
- ✅ 启动快速
- ✅ 适合开发调试

---

### 方式二：生产模式（推荐用于测试生产环境）

```bash
# 构建并启动生产服务
docker compose --profile prod up --build

# 或者后台运行
docker compose --profile prod up --build -d

# 访问地址
http://localhost:3000
```

**特点：**
- ✅ 完整的生产构建
- ✅ Nginx 静态文件服务
- ✅ 性能优化（Gzip压缩等）
- ✅ 适合生产环境测试

---

## 常用命令

### 启动服务
```bash
# 开发模式
docker compose --profile dev up

# 生产模式
docker compose --profile prod up --build

# 后台运行（添加 -d 参数）
docker compose --profile dev up -d
docker compose --profile prod up -d --build
```

### 停止服务
```bash
# 停止所有服务
docker compose down

# 停止并删除容器、网络、卷
docker compose down -v
```

### 查看日志
```bash
# 查看开发模式日志
docker compose --profile dev logs -f

# 查看生产模式日志
docker compose --profile prod logs -f

# 查看特定服务日志
docker logs three-o-fe-dev
docker logs three-o-fe-prod
```

### 重启服务
```bash
# 开发模式
docker compose --profile dev restart

# 生产模式
docker compose --profile prod restart
```

### 进入容器
```bash
# 进入开发容器
docker exec -it three-o-fe-dev sh

# 进入生产容器
docker exec -it three-o-fe-prod sh
```

### 重新构建镜像
```bash
# 强制重新构建（无缓存）
docker compose --profile prod build --no-cache

# 重新构建并启动
docker compose --profile prod up --build
```

---

## 端口说明

| 模式 | 容器端口 | 主机端口 | 说明 |
|------|---------|---------|------|
| 开发模式 | 8088 | 8088 | Vite 开发服务器 |
| 生产模式 | 3000 | 3000 | Nginx 静态服务 |

**修改端口：**
编辑 `docker compose.yml` 文件中的 `ports` 配置：
```yaml
ports:
  - "主机端口:容器端口"
```

---

## 配置说明

### 1. 后端 API 配置

#### 开发模式
编辑 `vite.config.js` 中的 `server.proxy` 配置：
```javascript
server: {
  proxy: {
    '/api': {
      target: 'http://your-backend:8080',
      changeOrigin: true
    }
  }
}
```

#### 生产模式
编辑 `nginx.local.conf` 中的 API 代理配置：
```nginx
location /api/ {
    proxy_pass http://your-backend-service:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

### 2. 环境变量

创建 `.env.local` 文件：
```bash
VITE_API_BASE_URL=http://localhost:8080
VITE_WS_URL=ws://localhost:8080
```

---

## 故障排查

### 1. 端口被占用
```bash
# 查看端口占用
lsof -i :8088  # 开发模式
lsof -i :3000  # 生产模式

# 修改 docker compose.yml 中的端口映射
ports:
  - "8089:8088"  # 改为其他端口
```

### 2. 构建失败
```bash
# 清理 Docker 缓存
docker system prune -a

# 删除所有容器和镜像
docker compose down -v
docker compose --profile prod build --no-cache
```

### 3. 依赖安装慢
如果在国内网络环境下载慢，已配置了淘宝镜像源：
- `Dockerfile.local` 中使用了 `registry.npmmirror.com`
- 如果仍然很慢，可以考虑使用 VPN 或其他镜像源

### 4. 热更新不生效（开发模式）
```bash
# 重启容器
docker compose --profile dev restart

# 如果还是不行，删除 node_modules 并重新安装
docker compose --profile dev down -v
docker compose --profile dev up
```

### 5. 查看构建日志
```bash
# 查看详细构建过程
docker compose --profile prod build --progress=plain
```

---

## 性能优化建议

### 开发模式
1. 使用 volume 缓存 `node_modules`（已配置）
2. 确保 Docker Desktop 分配足够的资源（CPU 2核+，内存 4GB+）

### 生产模式
1. 启用 Gzip 压缩（已在 nginx.local.conf 中配置）
2. 设置静态资源缓存（已配置）
3. 使用多阶段构建减小镜像体积（已配置）

---

## 文件说明

| 文件 | 说明 |
|------|------|
| `docker compose.yml` | Docker Compose 配置文件 |
| `Dockerfile.local` | 本地生产环境 Dockerfile |
| `nginx.local.conf` | 本地 Nginx 配置文件 |
| `.dockerignore` | Docker 构建忽略文件 |
| `README.docker.md` | 本文档 |

---

## 与现有 Dockerfile 的区别

| 项目 | 现有 Dockerfile | Dockerfile.local |
|------|----------------|------------------|
| 基础镜像 | 阿里云私有镜像 | 公共 Node/Nginx 镜像 |
| 使用场景 | 生产环境部署 | 本地开发测试 |
| 网络要求 | 需要阿里云 VPC | 公网可用 |
| Nginx 配置 | nginx.conf（生产配置） | nginx.local.conf（本地配置） |

---

## 常见场景

### 场景1：首次运行项目
```bash
# 1. 克隆项目
git clone <repo-url>
cd three-o-fe

# 2. 启动开发模式
docker compose --profile dev up

# 3. 访问 http://localhost:8088
```

### 场景2：测试生产构建
```bash
# 构建并启动生产环境
docker compose --profile prod up --build

# 访问 http://localhost:3000
```

### 场景3：同时运行开发和生产
```bash
# 修改其中一个的端口后可以同时运行
docker compose --profile dev up -d
docker compose --profile prod up -d
```

### 场景4：在服务器上部署
```bash
# 1. 上传代码到服务器
scp -r . user@server:/path/to/project

# 2. SSH 连接服务器
ssh user@server

# 3. 启动生产服务
cd /path/to/project
docker compose --profile prod up -d --build

# 4. 查看日志
docker compose --profile prod logs -f
```

---

## 技术支持

如有问题，请检查：
1. Docker 和 Docker Compose 是否正确安装
2. 端口是否被占用
3. Docker 是否有足够的资源
4. 查看容器日志排查错误

祝使用愉快！🚀

