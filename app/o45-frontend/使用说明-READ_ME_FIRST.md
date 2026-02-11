# 🚀 Docker 本地部署 - 开始使用

## ⚠️ 前提条件

在开始之前，请确保已安装 Docker：

```bash
# 检查 Docker 是否已安装
docker --version
docker compose version
```

**如果看到 "command not found" 错误**，请先安装 Docker：
👉 **[查看安装指南：DOCKER-安装指南.md](DOCKER-安装指南.md)**

---

## 立即开始（2步）

### 开发模式（推荐）
```bash
./docker-dev.sh
# 访问 http://localhost:8088
```

### 生产模式
```bash
./docker-prod.sh
# 访问 http://localhost:3000
```

**就这么简单！** 🎉

---

## 📖 重要文档

| 文档 | 内容 |
|------|------|
| **DOCKER-快速开始.md** | 快速使用指南，包含后端配置说明 |
| **DOCKER-配置说明.md** | 详细的配置说明和问题排查 |
| **README.docker.md** | 完整的命令参考和高级功能 |

---

## 🎯 核心配置

你的项目已配置为使用：

✅ **Dockerfile_rtc_test.local** - 本地可用的生产构建  
✅ **nginx_rtc_test.conf** - 你的原始 Nginx 配置  
✅ **支持动态后端配置** - 通过 URL 参数

---

## 🔧 配置后端服务

### 方式1：URL 参数（推荐）

访问时添加参数：
```
http://localhost:3000?login_url=localhost&login_port=8021&rtc_url=localhost&rtc_port=8020
```

### 方式2：修改默认值

编辑 `nginx_rtc_test.conf` 中的默认值：
```nginx
map $arg_login_url $login_host_base {
    "" localhost;  # 改为你的后端地址
    default $arg_login_url;
}
```

---

## 📊 两种模式

| 模式 | 命令 | 端口 | 特点 |
|------|------|------|------|
| **开发** | `./docker-dev.sh` | 8088 | 热更新，快速启动 |
| **生产** | `./docker-prod.sh` | 3000 | 完整构建，性能优化 |

**停止服务**：`./docker-stop.sh`

---

## 🆘 遇到问题？

### 端口被占用
修改 `docker compose.yml` 中的端口：
```yaml
ports:
  - "3001:3000"  # 改为其他端口
```

### 后端连接失败
1. 确认后端服务运行中
2. 使用正确的 URL 参数
3. 查看日志：`docker logs three-o-fe-prod`

### 构建失败
```bash
# 清理缓存
docker system prune -a

# 重新构建
docker compose --profile prod build --no-cache
```

---

## 📚 更多帮助

查看详细文档：
- **DOCKER-快速开始.md** - 快速上手
- **DOCKER-配置说明.md** - 深入配置
- **README.docker.md** - 完整手册

---

**开始你的开发之旅吧！** 🎊

如有问题，请查看上述文档或联系技术支持。

