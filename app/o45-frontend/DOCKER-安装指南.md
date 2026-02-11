# Docker 安装指南

## ⚠️ 你需要先安装 Docker

如果看到 `docker: command not found` 错误，说明你的系统上还没有安装 Docker。

---

## 🍎 macOS 安装 Docker Desktop（推荐）

### 方式一：官方下载（推荐）

1. **访问 Docker 官网**
   - 🔗 https://www.docker.com/products/docker-desktop

2. **下载对应版本**
   - **Apple Silicon (M1/M2/M3)**: 下载 "Mac with Apple chip"
   - **Intel Mac**: 下载 "Mac with Intel chip"

3. **安装步骤**
   ```bash
   # 下载后双击 .dmg 文件
   # 将 Docker 图标拖到 Applications 文件夹
   # 打开 Docker Desktop 应用
   ```

4. **等待启动**
   - 首次启动需要几分钟
   - 看到菜单栏上的 Docker 图标变为静止状态即可

5. **验证安装**
   ```bash
   docker --version
   docker compose version
   ```

### 方式二：使用 Homebrew

```bash
# 安装 Docker Desktop
brew install --cask docker

# 打开 Docker Desktop
open /Applications/Docker.app

# 等待启动完成后验证
docker --version
```

---

## 🐧 Linux 安装 Docker

### Ubuntu / Debian

```bash
# 更新软件包索引
sudo apt-get update

# 安装必要的包
sudo apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release

# 添加 Docker 官方 GPG 密钥
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# 设置仓库
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# 安装 Docker Engine
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# 启动 Docker
sudo systemctl start docker
sudo systemctl enable docker

# 将当前用户添加到 docker 组（避免每次使用 sudo）
sudo usermod -aG docker $USER

# 重新登录或运行
newgrp docker

# 验证安装
docker --version
docker compose version
```

### CentOS / RHEL

```bash
# 安装必要的包
sudo yum install -y yum-utils

# 添加 Docker 仓库
sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo

# 安装 Docker
sudo yum install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# 启动 Docker
sudo systemctl start docker
sudo systemctl enable docker

# 将当前用户添加到 docker 组
sudo usermod -aG docker $USER
newgrp docker

# 验证安装
docker --version
docker compose version
```

---

## 🪟 Windows 安装 Docker Desktop

### 系统要求
- Windows 10 64-bit: Pro, Enterprise, or Education (Build 19041 或更高)
- 或 Windows 11
- 启用 WSL 2

### 安装步骤

1. **启用 WSL 2**
   ```powershell
   # 以管理员身份运行 PowerShell
   wsl --install
   
   # 重启电脑
   ```

2. **下载 Docker Desktop**
   - 🔗 https://www.docker.com/products/docker-desktop
   - 下载 "Docker Desktop for Windows"

3. **安装**
   - 双击 .exe 文件
   - 按照向导完成安装
   - 确保选中 "Use WSL 2 instead of Hyper-V"

4. **启动 Docker Desktop**
   - 从开始菜单启动
   - 等待启动完成

5. **验证安装**
   ```powershell
   docker --version
   docker compose version
   ```

---

## ✅ 验证 Docker 已正确安装

运行以下命令检查：

```bash
# 检查 Docker 版本
docker --version
# 应该输出: Docker version 24.x.x, build xxxxx

# 检查 Docker Compose 版本
docker compose version
# 应该输出: Docker Compose version v2.x.x

# 运行测试容器
docker run hello-world
# 应该看到 "Hello from Docker!" 消息

# 检查 Docker 是否运行
docker ps
# 应该显示空列表或运行中的容器
```

---

## 🚀 安装完成后

### 1. 确认 Docker Desktop 正在运行

**macOS:**
- 查看菜单栏右上角是否有 Docker 鲸鱼图标
- 图标应该是静止的（不是动画）

**Windows:**
- 查看系统托盘是否有 Docker 图标
- 确保状态显示 "Docker Desktop is running"

### 2. 配置 Docker（可选）

**增加资源分配（推荐）:**

Docker Desktop → Settings → Resources:
- **CPU**: 至少 2 核（推荐 4 核）
- **Memory**: 至少 4GB（推荐 8GB）
- **Disk**: 至少 20GB

### 3. 配置镜像加速（国内推荐）

**macOS/Windows:**

Docker Desktop → Settings → Docker Engine

添加以下配置：
```json
{
  "registry-mirrors": [
    "https://registry.docker-cn.com",
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com"
  ]
}
```

**Linux:**

编辑 `/etc/docker/daemon.json`:
```bash
sudo nano /etc/docker/daemon.json
```

添加：
```json
{
  "registry-mirrors": [
    "https://registry.docker-cn.com",
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com"
  ]
}
```

重启 Docker:
```bash
sudo systemctl restart docker
```

---

## 🎯 安装完成后运行项目

```bash
# 进入项目目录
cd /Users/sumin/ModelBestProject/three-o-fe

# 开发模式
./docker-dev.sh

# 或生产模式
./docker-prod.sh
```

---

## ⚠️ 常见安装问题

### macOS: "Docker Desktop requires macOS 11 or later"
**解决**: 升级 macOS 或使用旧版本 Docker

### Windows: "WSL 2 installation is incomplete"
**解决**: 
```powershell
wsl --update
wsl --set-default-version 2
```

### Linux: "permission denied"
**解决**:
```bash
sudo usermod -aG docker $USER
newgrp docker
# 或重新登录
```

### "Docker daemon is not running"
**解决**:
- **macOS/Windows**: 启动 Docker Desktop 应用
- **Linux**: `sudo systemctl start docker`

---

## 📚 更多资源

- 🔗 [Docker 官方文档](https://docs.docker.com/)
- 🔗 [Docker Desktop 下载](https://www.docker.com/products/docker-desktop)
- 🔗 [Docker 中文社区](https://www.docker.org.cn/)

---

## 🆘 需要帮助？

安装完成后如果还有问题，请查看：
- [常见问题FAQ.md](常见问题FAQ.md)
- [DOCKER-快速开始.md](DOCKER-快速开始.md)

---

**安装完成后，你就可以使用 Docker 运行本项目了！** 🎉

