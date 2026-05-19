# 🏆 VidFetch 阿里云 ECS 生产环境无痛部署指南

本指南记录了在 **Ubuntu 24.04 (Noble)** 服务器上，绕过所有网络及系统底层依赖坑（如 Snap 卡死、缺失图形库、静态资源权限等），一步步实现前端与后端完美运行的**最简成功路线**。

---

## 📋 第一步：系统环境与 Chrome 依赖补全 (避开 Snap 坑)

首先登录你的阿里云服务器，在终端运行以下命令安装 Node.js、PM2 以及运行 Chrome 所需的所有系统底层依赖（针对 Ubuntu 24.04 优化，避免任何缺失库报错）：

```bash
# 1. 安装 Node.js 18+ (如果服务器已装 Node.js 可跳过)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. 安装 PM2 进程守护工具
sudo npm install -g pm2

# 3. 安装运行无头浏览器必需的系统图形/音频底层依赖（专为 Ubuntu 24.04 适配，极速安装不会卡死）
sudo apt-get update && sudo apt-get install -y \
  libatk1.0-0t64 \
  libatk-bridge2.0-0t64 \
  libxcomposite1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxi6 \
  libxrandr2 \
  libgbm1 \
  libxkbcommon0 \
  libasound2t64 \
  libpango-1.0-0 \
  libnspr4 \
  libnss3 \
  libcups2 \
  libdrm2 \
  libdbus-1-3 \
  libxshmfence1 \
  libcairo2 \
  libgdk-pixbuf-2.0-0 \
  libgtk-3-0 \
  libx11-xcb1 \
  libxss1 \
  libxtst6 \
  libpangocairo-1.0-0
```

---

## 🛠️ 第二步：同步代码与前端打包

进入你的项目目录 `/home/project/Media_Tools`。

### 1. 同步最新代码
```bash
cd /home/project/Media_Tools
git pull origin video_fetch
```

### 2. 编译打包前端代码 (生成网页静态文件)
```bash
# 进入前端目录
cd /home/project/Media_Tools/frontend

# 更换国内源，并极速编译
npm config set registry https://registry.npmmirror.com
npm install
npm run build
```
*打包完成后，会在 `frontend/` 下自动生成 `dist/` 文件夹。*

---

## 📦 第三步：安装后端依赖与高速下载 Chrome

返回项目根目录，安装后端依赖，并从阿里 CDN 极速下载无头浏览器：

```bash
# 1. 回到根目录
cd /home/project/Media_Tools

# 2. 设置环境变量：跳过默认的慢速浏览器下载，秒级装完后端基础包
export PUPPETEER_SKIP_DOWNLOAD=true
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
npm config set registry https://registry.npmmirror.com
npm install

# 3. 从阿里高速 CDN 镜像下载 Chrome (只需 10~15 秒即可下完)
PUPPETEER_DOWNLOAD_BASE_URL=https://cdn.npmmirror.com/binaries/chrome-for-testing npx puppeteer browsers install chrome
```

---

## ⚙️ 第四步：配置 Nginx 反向代理 (端口 90)

我们让 Nginx 监听 **90 端口** 负责静态网页的分发，并将 `/api` 的动态请求转发给跑在 **3000 端口** 上的 Node.js 服务。

### 1. 编写 Nginx 配置文件
在 `/etc/nginx/conf.d/` 目录下新建 `vidfetch.conf`：
```bash
sudo nano /etc/nginx/conf.d/vidfetch.conf
```
将以下内容直接粘贴进去（确保文件开头是 `server`，末尾是 `}`，**不要**包含任何 ``` 标记）：
```nginx
server {
    listen 90;
    server_name localhost;

    # 开启 Gzip 压缩，网页秒开
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # 1. 托管前端静态编译后的网页
    location / {
        root /home/project/Media_Tools/frontend/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # 2. 反向代理后端 API 接口到 3000 端口 the Node 服务
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        
        # 延长超时阈值，防止 Puppeteer 解析超慢视频时触发 Nginx 504 报错
        proxy_connect_timeout 60s;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }
}
```

### 2. 授权项目目录并启动 Nginx
为了避免 Nginx 因为读取限制报 403/500 错误，需要给项目目录授权：
```bash
# 给予父级和项目目录访问与读取权限
sudo chmod +x /home
sudo chmod +x /home/project
sudo chmod -R 755 /home/project/Media_Tools

# 检查 Nginx 语法并重启
sudo nginx -t
sudo systemctl restart nginx
```

---

## 🚀 第五步：使用 PM2 启动后端服务

在项目根目录下，直接启动 Node.js 解析引擎：

```bash
cd /home/project/Media_Tools

# 1. 使用 PM2 启动服务 (后端默认监听 3000 端口)
pm2 start server.js --name "vidfetch"

# 2. 设置开机自启动
pm2 startup
pm2 save
```

### 💡 常用维护指令：
* 查看状态：`pm2 list`
* 查看日志：`pm2 logs vidfetch`
* 重举/重启服务：`pm2 restart vidfetch`

---

## 🛡️ 第六步：开放阿里云安全组

1. 登录 **阿里云控制台** ➡️ **云服务器 ECS**。
2. 找到你的服务器实例，点击 **安全组** ➡️ **配置规则**。
3. 在**入方向**添加一条规则：
   * **协议类型**：`自定义 TCP`
   * **端口范围**：`90`
   * **授权对象**：`0.0.0.0/0`
4. 保存规则。

现在，大功告成！直接在浏览器访问 **`http://你的公网IP:90`** 即可完美体验无水印、超清画质的视频嗅探与下载服务！
