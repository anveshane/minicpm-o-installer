# Docker 配置说明

## 文件说明

你的项目现在有以下 Docker 相关文件：

| 文件 | 用途 | 说明 |
|------|------|------|
| **Dockerfile_rtc_test** | 生产环境（原始） | 使用阿里云私有镜像，需要 VPC 访问 |
| **Dockerfile_rtc_test.local** | 生产环境（本地） | ✅ 使用公共镜像，本地可用 |
| **nginx_rtc_test.conf** | Nginx配置 | ✅ 支持动态后端配置 |
| **docker compose.yml** | Docker Compose | ✅ 已配置使用本地版本 |

---

## 当前配置

`docker compose.yml` 默认使用 **Dockerfile_rtc_test.local**，这个版本：

✅ 使用公共 Node.js 和 Nginx 镜像  
✅ 功能与 Dockerfile_rtc_test 完全相同  
✅ 不需要访问阿里云 VPC  
✅ 使用你的 nginx_rtc_test.conf 配置  

---

## 如何使用原始的 Dockerfile_rtc_test？

如果你在能访问阿里云私有镜像的环境（如公司内网），可以这样做：

### 方法1：修改 docker compose.yml

```yaml
services:
  web-prod:
    build:
      context: .
      dockerfile: Dockerfile_rtc_test  # 改为原始文件
```

### 方法2：直接使用 Docker 命令

```bash
# 构建
docker build -t three-o-fe -f Dockerfile_rtc_test .

# 运行
docker run -d -p 3000:3000 --name three-o-fe-prod three-o-fe
```

---

## Dockerfile 对比

### Dockerfile_rtc_test（原始）

```dockerfile
# 使用阿里云私有镜像
FROM modelbest-registry-vpc.cn-beijing.cr.aliyuncs.com/modelbest/playground:20.10.0
```

**优点：**
- 公司内部优化的镜像
- 可能包含预装的工具

**缺点：**
- ❌ 需要阿里云 VPC 访问权限
- ❌ 本地开发环境无法使用
- ❌ 缺少 CMD 命令（需要手动启动 nginx）

---

### Dockerfile_rtc_test.local（本地）

```dockerfile
# 使用公共镜像
FROM node:20.10.0
FROM nginx:alpine
```

**优点：**
- ✅ 任何环境都能使用
- ✅ 包含完整的启动命令
- ✅ 镜像体积更小

**缺点：**
- 无（功能完全相同）

---

## nginx_rtc_test.conf 特性

你的 Nginx 配置非常强大，支持：

### 1. 动态后端配置

通过 URL 参数配置后端服务：

```
http://localhost:3000?login_url=<地址>&login_port=<端口>&rtc_url=<地址>&rtc_port=<端口>
```

### 2. 多端口支持

支持通过 `port` 参数选择不同的后端：

```nginx
map $arg_port $backend {
    "8020" http://10.17.8.4:8020;
    "8021" http://10.17.8.4:8021;
    # ... 更多端口
}
```

### 3. 代理路径

| 路径 | 后端变量 | 说明 |
|------|---------|------|
| `/api` | `$login_backend` | API 接口 |
| `/login` | `$login_backend` | 登录 |
| `/logout` | `$login_backend` | 登出 |
| `/download` | `$login_backend` | 下载 |
| `/rtc` | `$rtc_backend` | RTC WebSocket |
| `/ws` | `$backend` | 传统 WebSocket |

### 4. 默认值

```nginx
login_url:  10.158.0.32
login_port: 8021
rtc_url:    10.158.0.32
rtc_port:   8020
```

---

## 本地开发建议

### 开发模式（推荐）

```bash
docker compose --profile dev up
```

- 访问：http://localhost:8088
- 支持热更新
- 使用 `vite.config.js` 中的代理配置

### 生产模式（测试）

```bash
docker compose --profile prod up --build
```

- 访问：http://localhost:3000
- 使用 `nginx_rtc_test.conf` 配置
- 支持 URL 参数配置后端

---

## 环境变量配置（可选）

如果不想每次都在 URL 中传参数，可以修改 `nginx_rtc_test.conf`：

```nginx
# 修改默认值
map $arg_login_url $login_host_base {
    "" localhost;  # 改为 localhost
    default $arg_login_url;
}

map $arg_login_port $login_port_value {
    "" 8021;  # 保持或修改端口
    default $arg_login_port;
}
```

或者使用环境变量（需要修改 Dockerfile 和 nginx 配置）：

```dockerfile
ENV LOGIN_URL=localhost
ENV LOGIN_PORT=8021
ENV RTC_URL=localhost
ENV RTC_PORT=8020
```

---

## 故障排查

### 1. 构建失败："无法访问镜像"

**原因**：使用了 `Dockerfile_rtc_test`，但无法访问阿里云私有镜像

**解决**：
```bash
# 确认使用本地版本
docker compose config | grep dockerfile
# 应该显示：dockerfile: Dockerfile_rtc_test.local
```

### 2. Nginx 无法启动

**检查配置**：
```bash
# 进入容器检查配置
docker exec -it three-o-fe-prod sh
nginx -t
```

### 3. 后端代理不工作

**查看日志**：
```bash
docker logs three-o-fe-prod -f
```

**测试连接**：
```bash
# 从容器内测试后端连接
docker exec -it three-o-fe-prod sh
wget -O- http://your-backend:8021/api/health
```

---

## 推荐配置总结

✅ **使用 Dockerfile_rtc_test.local**（已配置）  
✅ **使用 nginx_rtc_test.conf**（已配置）  
✅ **通过 URL 参数配置后端**  
✅ **开发时使用 dev 模式**  
✅ **测试时使用 prod 模式**  

这样既保留了你原有配置的所有功能，又能在本地环境顺利运行！🎉

