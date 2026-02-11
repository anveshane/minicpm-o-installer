# Docker 快速开始 🚀

## 一、最快速启动（3步）

### 方式1：开发模式（推荐，支持热更新）
```bash
# 1. 启动
./docker-dev.sh

# 2. 访问
http://localhost:8088

# 3. 停止
./docker-stop.sh
```

### 方式2：生产模式（使用 nginx_rtc_test.conf）
```bash
# 1. 启动
./docker-prod.sh

# 2. 访问（支持动态配置后端）
http://localhost:3000

# 3. 配置后端服务（通过URL参数）
http://localhost:3000?login_url=localhost&login_port=8021&rtc_url=localhost&rtc_port=8020

# 4. 停止
./docker-stop.sh
```

---

## 二、或者使用 Docker Compose 命令

### 开发模式（支持热更新）
```bash
# 启动
docker compose --profile dev up

# 后台运行
docker compose --profile dev up -d

# 访问: http://localhost:8088
```

### 生产模式（完整构建）
```bash
# 启动
docker compose --profile prod up --build

# 后台运行
docker compose --profile prod up -d --build

# 访问: http://localhost:3000
```

### 停止服务
```bash
docker compose down
```

---

## 三、查看日志
```bash
# 开发模式
docker compose --profile dev logs -f

# 生产模式
docker compose --profile prod logs -f
```

---

## 四、后端服务配置（重要！）

你的项目使用 `nginx_rtc_test.conf`，支持通过 URL 参数动态配置后端服务。

### 配置方法

访问前端时，在URL中添加参数：

```
http://localhost:3000?login_url=<登录服务地址>&login_port=<端口>&rtc_url=<RTC服务地址>&rtc_port=<端口>
```

### 配置示例

**示例1：使用本地后端服务**
```
http://localhost:3000?login_url=localhost&login_port=8021&rtc_url=localhost&rtc_port=8020
```

**示例2：使用局域网服务器**
```
http://localhost:3000?login_url=192.168.1.100&login_port=8021&rtc_url=192.168.1.100&rtc_port=8020
```

**示例3：使用域名**
```
http://localhost:3000?login_url=api.example.com&login_port=443&rtc_url=rtc.example.com&rtc_port=443
```

### 默认值（不提供参数时使用）

- `login_url`: 10.158.0.32
- `login_port`: 8021
- `rtc_url`: 10.158.0.32
- `rtc_port`: 8020

### 可配置的后端路径

根据 `nginx_rtc_test.conf` 配置，以下路径会代理到后端：

| 路径 | 用途 | 使用的后端 |
|------|------|-----------|
| `/api` | API 接口 | login backend |
| `/login` | 登录接口 | login backend |
| `/logout` | 登出接口 | login backend |
| `/download` | 下载接口 | login backend |
| `/rtc` | RTC WebSocket | rtc backend |
| `/ws` | WebSocket（旧） | 使用 port 参数配置 |

---

## 五、常见问题

### 端口被占用？
编辑 `docker-compose.yml`，修改端口映射：
```yaml
ports:
  - "8089:8088"  # 改成其他端口
```

### 需要重新安装依赖？
```bash
docker compose down -v
docker compose --profile dev up
```

### 需要清理缓存？
```bash
docker system prune -a
```

### 后端服务连接不上？

1. **检查后端服务是否运行**
```bash
# 测试登录服务
curl http://localhost:8021/api/health

# 测试 RTC 服务
curl http://localhost:8020/rtc/health
```

2. **如果使用 Docker 网络**

后端服务如果也在 Docker 中运行，需要：
- 使用 `host.docker.internal` 替代 `localhost`
- 或者将前后端服务放在同一个 Docker 网络中

示例：
```
http://localhost:3000?login_url=host.docker.internal&login_port=8021
```

3. **查看 Nginx 日志**
```bash
docker logs three-o-fe-prod
```

---

## 六、两种模式对比

| 特性 | 开发模式 | 生产模式 |
|------|---------|---------|
| 启动速度 | ⚡ 快 | 🐢 慢（需构建）|
| 热更新 | ✅ 支持 | ❌ 不支持 |
| 适用场景 | 开发调试 | 生产测试 |
| 访问地址 | :8088 | :3000 |
| 性能 | 一般 | 优化 |

---

## 📚 详细文档
查看 `README.docker.md` 了解更多高级功能和配置选项。

---

**就这么简单！开始你的开发之旅吧！** 🎉

