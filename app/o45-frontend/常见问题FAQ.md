# Docker 常见问题 FAQ

## ❓ docker: command not found

### 问题
运行脚本时出现错误：
```
docker: command not found
```

### 原因
系统上没有安装 Docker，或 Docker 没有正确配置。

### 解决方案 ✅

**1. 安装 Docker Desktop（推荐）**

查看完整安装指南：**[DOCKER-安装指南.md](DOCKER-安装指南.md)**

**macOS 快速安装：**
```bash
# 使用 Homebrew
brew install --cask docker

# 或访问官网下载
# https://www.docker.com/products/docker-desktop
```

**2. 确认 Docker Desktop 正在运行**
- macOS: 查看菜单栏是否有 Docker 图标
- 图标应该是静止的（不是动画）

**3. 验证安装**
```bash
docker --version
docker compose version
```

**4. 如果已安装但仍报错**
```bash
# 检查 Docker 路径
which docker

# 添加到 PATH（如果需要）
echo 'export PATH="/usr/local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

---

## ❓ docker-compose: command not found

### 问题
运行 `./docker-dev.sh` 时出现错误：
```
docker-compose: command not found
```

### 原因
从 Docker Desktop 2020年后的版本开始，`docker-compose` 命令已整合到 Docker CLI 中。

### 解决方案 ✅

**新版本使用（推荐）：**
```bash
docker compose  # 没有连字符
```

**旧版本（已弃用）：**
```bash
docker-compose  # 有连字符
```

### 检查你的版本

```bash
# 检查 Docker 版本
docker --version

# 检查 Compose 版本
docker compose version
```

### 如果你使用旧版本

如果你的 Docker 版本较旧，仍然使用 `docker-compose`，可以修改脚本：

**修改 docker-dev.sh：**
```bash
# 将这一行
docker compose --profile dev up

# 改为
docker-compose --profile dev up  # 添加连字符
```

---

## ❓ 端口被占用

### 问题
```
Error: Bind for 0.0.0.0:3000 failed: port is already allocated
```

### 解决方案

**方案1：停止占用端口的服务**
```bash
# 查看谁在使用端口
lsof -i :3000

# 停止进程（替换 PID）
kill -9 <PID>
```

**方案2：更改 Docker 映射端口**

编辑 `docker-compose.yml`：
```yaml
services:
  web-prod:
    ports:
      - "3001:3000"  # 改为 3001 或其他端口
```

---

## ❓ 后端服务连接不上

### 问题
前端能访问，但无法连接到后端 API

### 检查步骤

**1. 确认后端服务运行**
```bash
# 测试登录服务
curl http://localhost:8021/api/health

# 测试 RTC 服务  
curl http://localhost:8020/rtc/health
```

**2. 检查 URL 参数是否正确**
```
http://localhost:3000?login_url=localhost&login_port=8021&rtc_url=localhost&rtc_port=8020
```

**3. 如果后端也在 Docker 中**

使用 `host.docker.internal` 而不是 `localhost`：
```
http://localhost:3000?login_url=host.docker.internal&login_port=8021
```

**4. 查看 Nginx 日志**
```bash
docker logs three-o-fe-prod -f
```

---

## ❓ 热更新不生效（开发模式）

### 问题
修改代码后页面不自动刷新

### 解决方案

**1. 重启开发容器**
```bash
./docker-stop.sh
./docker-dev.sh
```

**2. 清理并重启**
```bash
docker compose down -v
docker compose --profile dev up
```

**3. 检查文件挂载**
确认 `docker-compose.yml` 中有正确的 volumes 配置：
```yaml
volumes:
  - .:/app
  - /app/node_modules
```

---

## ❓ 构建失败或很慢

### 问题
构建过程中出现错误或下载依赖很慢

### 解决方案

**1. 使用国内镜像（已配置）**
```dockerfile
RUN pnpm config set registry https://registry.npmmirror.com/
```

**2. 清理 Docker 缓存**
```bash
# 清理所有未使用的数据
docker system prune -a

# 无缓存重新构建
docker compose --profile prod build --no-cache
```

**3. 增加 Docker 资源**

Docker Desktop → Settings → Resources：
- CPU: 至少 2 核
- Memory: 至少 4GB

---

## ❓ 容器启动后立即退出

### 问题
```
docker ps  # 没有看到运行的容器
```

### 解决方案

**查看容器日志**
```bash
docker logs three-o-fe-prod
# 或
docker logs three-o-fe-dev
```

**常见原因：**

1. **Nginx 配置错误**
```bash
# 检查配置
docker exec -it three-o-fe-prod nginx -t
```

2. **端口冲突**
```bash
# 更改端口（见上文）
```

3. **构建失败**
```bash
# 查看构建日志
docker compose --profile prod build
```

---

## ❓ 如何查看容器内部文件

### 进入容器
```bash
# 开发容器
docker exec -it three-o-fe-dev sh

# 生产容器
docker exec -it three-o-fe-prod sh
```

### 查看文件
```bash
# 开发容器中
ls -la /app

# 生产容器中
ls -la /usr/share/nginx/html
cat /etc/nginx/nginx.conf
```

---

## ❓ 如何完全清理 Docker

### 彻底清理
```bash
# 停止所有容器
docker compose down

# 删除所有容器
docker rm -f $(docker ps -aq)

# 删除所有镜像
docker rmi -f $(docker images -q)

# 清理所有数据
docker system prune -a --volumes
```

⚠️ **警告**：这会删除所有 Docker 数据，包括其他项目！

---

## ❓ npm/pnpm 安装依赖失败

### 问题
```
ERR! network timeout
ERR! network request failed
```

### 解决方案

**1. 修改 Dockerfile 中的镜像源**
```dockerfile
RUN npm config set registry https://registry.npmmirror.com/
# 或使用其他镜像源
```

**2. 使用代理**
```dockerfile
ENV HTTP_PROXY=http://proxy.example.com:8080
ENV HTTPS_PROXY=http://proxy.example.com:8080
```

**3. 直接在主机安装后挂载**
```bash
# 在主机上安装依赖
npm install

# 然后使用开发模式（已挂载 node_modules）
./docker-dev.sh
```

---

## ❓ 权限问题

### 问题（Linux）
```
permission denied
```

### 解决方案

**1. 给脚本执行权限**
```bash
chmod +x docker-dev.sh docker-prod.sh docker-stop.sh
```

**2. 将用户添加到 docker 组**
```bash
sudo usermod -aG docker $USER
# 然后重新登录
```

---

## ❓ Windows 特定问题

### 路径问题
```
invalid reference format
```

**解决方案：**
- 使用 WSL2 运行 Docker
- 确保项目在 WSL2 文件系统中（不是在 /mnt/c）

### 行尾符问题
```bash
# 转换 CRLF 到 LF
dos2unix docker-dev.sh docker-prod.sh docker-stop.sh
```

---

## 🆘 仍然有问题？

### 收集信息

```bash
# 1. Docker 版本
docker --version
docker compose version

# 2. 容器状态
docker ps -a

# 3. 容器日志
docker logs three-o-fe-prod
docker logs three-o-fe-dev

# 4. 系统信息
docker info

# 5. 构建日志
docker compose --profile prod build --progress=plain
```

### 联系支持

提供以上信息以便快速解决问题。

---

**更多帮助：**
- [DOCKER-快速开始.md](DOCKER-快速开始.md)
- [DOCKER-配置说明.md](DOCKER-配置说明.md)
- [README.docker.md](README.docker.md)

