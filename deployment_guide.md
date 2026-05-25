# 🚀 VidFetch 生产环境单端口部署指南 (端口 90)

为了在生产环境实现极简的单端口部署（在 90 端口上同时托管 Vue 3 前端界面与 Node.js 后端接口），项目采用了经典的前端打包静态文件、Nginx 进行动静分离托管反代，或 Node.js 服务端直拉托管的运行模式。

线上环境推荐采用 **方案 B：Nginx 反向代理模式**。以下是详细的部署步骤。

---

## 📋 第一步：在 Linux 服务器上安装必要环境

以主流的 Ubuntu/CentOS 服务器为例，首先确保安装了 **Node.js**（推荐 18+）与进程守护工具 **PM2**。

### 1. 安装 Node.js (以 Ubuntu 为例，如已安装可跳过)
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 2. 全局安装 PM2 进程守护工具
```bash
sudo npm install -g pm2
```

### 3. 安装 Puppeteer 所需的 Linux 浏览器依赖（极为关键）
Linux 服务器默认没有图形化库，如果不安装以下依赖，Puppeteer 启动 Chrome 会报错崩溃：
* **Ubuntu/Debian 依赖安装**：
  ```bash
  sudo apt-get update && sudo apt-get install -y ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 libgcc1 libgconf-2-4 libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 lsb-release xdg-utils wget libxshmfence1 libglu1
  ```
* **CentOS/RHEL 依赖安装**：
  ```bash
  sudo yum install -y alsa-lib atk cups-libs gtk3 libXcomposite libXcursor libXdamage libXext libXi libXrandr libXscrnsaver libXtst pango xorg-x11-server-utils xorg-x11-utils
  ```

---

## 🛠️ 第二步：代码同步与前端打包

### 1. 进入项目根目录并同步代码
```bash
cd /home/project/Media_Tools
git pull origin video_fetch
```

### 2. 编译打包前端 Vue 3 代码
```bash
cd /home/project/Media_Tools/frontend
npm config set registry https://registry.npmmirror.com # 切换为国内镜像源
npm install
npm run build
```
编译成功后，会在 `frontend/` 目录下生成 `dist/` 文件夹。

### 3. 安装后端 Node.js 依赖
```bash
cd /home/project/Media_Tools
export PUPPETEER_SKIP_DOWNLOAD=true
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
npm install
# 从阿里云 CDN 高速下载匹配的无头浏览器
PUPPETEER_DOWNLOAD_BASE_URL=https://cdn.npmmirror.com/binaries/chrome-for-testing npx puppeteer browsers install chrome
```

---

## 🚀 第三步：配置 Nginx 反向代理 (方案 B：推荐)

Nginx 托管静态资源效率极高，且便于配置 HTTPS (SSL)。本节配置 Nginx 监听 90 端口，并反向代理后端 API 至 3000 端口。

### 1. 编写 Nginx 配置文件
在 `/etc/nginx/conf.d/` 目录下新建配置文件 `vidfetch.conf`：
```bash
sudo nano /etc/nginx/conf.d/vidfetch.conf
```
粘贴以下配置：
```nginx
server {
    listen 90;
    server_name localhost; # 或者是你的服务器公网 IP / 域名

    # 开启 Gzip 压缩，显著提升网页加载速度
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # 1. 托管前端静态编译文件
    location / {
        root /home/project/Media_Tools/frontend/dist;
        index index.html;
        try_files $uri $uri/ /index.html; # 支持 SPA 路由路由兜底
    }

    # 2. 反向代理后端 API 接口到 3000 端口的 Node 服务
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        
        # 延长超时阈值，防止 Puppeteer 在后台解析超慢视频时触发 Nginx 504 报错
        proxy_connect_timeout 90s;
        proxy_read_timeout 90s;
        proxy_send_timeout 90s;
    }
}
```

### 2. 授权项目目录并重启 Nginx
为了防止 Nginx 报 403 权限拒绝：
```bash
sudo chmod +x /home
sudo chmod +x /home/project
sudo chmod -R 755 /home/project/Media_Tools

sudo nginx -t          # 检查语法是否正确
sudo systemctl restart nginx # 重启 Nginx
```

---

## 守护进程：使用 PM2 启动后端服务

在项目根目录下，使用 PM2 启动 Express 服务（默认绑定端口 3000）：

```bash
cd /home/project/Media_Tools
pm2 start server.js --name "vidfetch"
```

### 常用管理命令：
* 查看状态：`pm2 list`
* 查看日志：`pm2 logs vidfetch`
* 重启服务：`pm2 restart vidfetch`
* 开机自启：`pm2 startup && pm2 save`

---

## 🛡️ 第四步：开放云服务器安全组端口 90

1. 登录云服务器控制台（如阿里云 ECS 规则）。
2. 在安全组入方向配置规则，放行 `TCP 协议` 端口范围 `90`。
3. 授权对象设为 `0.0.0.0/0` (允许所有外网 IP 访问)。

访问 **`http://你的公网IP:90`**，即可体验完整的视频提取、防盗链代理下载、ASR 语音转写及 AI 总结服务。
