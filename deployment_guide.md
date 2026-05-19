# 🚀 VidFetch 阿里云 ECS 生产环境部署指南 (端口 90)

为了实现极简的单端口部署（在 90 端口上同时托管 Vue 3 前端界面与 Node.js 后端接口），我已经对源码做出了两处重大优化：
1. **API 地址动态化**：前端会自动识别访问来源，如果是线上，会自动以 `window.location.origin` 作为 API 终点，彻底规避跨域与多端口占用。
2. **静态资产托管**：在 `server.js` 中加入了静态文件服务。运行 `server.js` 时，它会自动托管 `frontend/dist` 下的 Vue 3 生产构建文件。因此，**线上环境仅需运行一个 Node 进程即可**。

以下是详细的部署步骤。

---

## 📋 第一步：在阿里云服务器安装必要环境

在终端登录你的阿里云 ECS，首先确保安装了 **Node.js**（推荐 18+）与 **PM2**。

### 1. 安装 Node.js (以 Ubuntu 为例，如已安装可跳过)
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 2. 全局安装进程守护工具 PM2
```bash
sudo npm install -g pm2
```

### 3. 安装 Puppeteer 所需的 Linux 浏览器依赖（极为关键）
Linux 服务器默认没有图形化库，如果不安装以下依赖，Puppeteer 启动 Chrome 会报错崩溃。
* **Ubuntu/Debian 依赖安装**：
  ```bash
  sudo apt-get update && sudo apt-get install -y ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 libgcc1 libgconf-2-4 libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 lsb-release xdg-utils wget libxshmfence1 libglu1
  ```
* **CentOS/RHEL 依赖安装**：
  ```bash
  sudo yum install -y alsa-lib atk cups-libs gtk3 libXcomposite libXcursor libXdamage libXext libXi libXrandr libXscrnsaver libXtst pango xorg-x11-server-utils xorg-x11-utils
  ```

---

## 🛠️ 第二步：同步代码与生产打包

进入你的项目目录 `/home/project/Media_Tools`，将刚才修改的代码同步并完成编译。

### 1. 同步最新代码
```bash
cd /home/project/Media_Tools
git pull origin video_fetch
```
*(注意：若提示本地有冲突或未提交，可使用 `git stash` 暂存后再 pull，或者使用 `git reset --hard origin/video_fetch` 强制对齐)*

### 2. 编译前端 Vue 3 代码
```bash
cd /home/project/Media_Tools/frontend
npm install   # 或 pnpm install
npm run build # 编译前端
```
*编译成功后，会在 `frontend/` 下生成 `dist/` 文件夹。*

### 3. 安装后端依赖并配置系统级 Chromium
由于国内服务器拉取 Puppeteer 内置 Chrome 极其缓慢且极易报错，**强烈推荐跳过内置浏览器下载，改用 Linux 系统自带的 Chromium**：

```bash
cd /home/project/Media_Tools

# 1. 临时设置环境变量，让 npm 跳过浏览器下载，实现 10 秒极速安装
export PUPPETEER_SKIP_DOWNLOAD=true
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# 2. 安装后端所需基础库 (Express, Axios 等)
npm install # 或 pnpm install

# 3. 通过 Linux 包管理器安装系统 Chromium
# Ubuntu/Debian 系统：
sudo apt-get update && sudo apt-get install -y chromium-browser
# CentOS/RHEL 系统：
sudo yum install -y chromium
```


---

## 🚀 第三步：使用 PM2 在 90 端口启动并守护进程

在项目根目录下，指定环境变量 `PORT=90` 启动 Express 服务：

```bash
cd /home/project/Media_Tools
PORT=90 pm2 start server.js --name "vidfetch"
```

### 常用 PM2 命令：
* **查看运行状态**：`pm2 list`
* **查看实时日志**：`pm2 logs vidfetch`
* **重启服务**：`pm2 restart vidfetch`
* **停止服务**：`pm2 stop vidfetch`

### 开机自启：
要保证你的阿里云服务器重启后服务依然自动开启，执行：
```bash
pm2 startup
pm2 save
```

---

## 🛡️ 第四步：开放阿里云安全组 (ECS Security Group)

这是最重要的一步，如果不配置，外网将无法访问 90 端口：
1. 登录 **阿里云控制台** ➡️ **云服务器 ECS**。
2. 找到你的 ECS 实例，点击 **安全组** ➡️ **配置规则**。
3. 在**入方向**添加一条规则：
   * **协议类型**：`自定义 TCP`
   * **端口范围**：`90`
   * **授权对象**：`0.0.0.0/0`（允许所有外网 IP 访问）
4. 保存规则。

现在，你就可以直接在浏览器中访问 **`http://你的公网IP:90`**，完美体验无水印、超清画质的视频嗅探与下载服务了！

---

## 🎨 进阶推荐：是否需要配置 Nginx？

**结论：不是强制需要，但强烈推荐。**

### 💡 方案对比与选择：

| 部署方案 | 优点 | 缺点 | 适用场景 |
| :--- | :--- | :--- | :--- |
| **方案 A：纯 Node.js 直接部署 (前文介绍)** | 极简，不用安装配置 Nginx，配置 1 分钟搞定。 | 1. Node.js 必须以 root 权限运行才能绑定 90 端口（安全隐患）；<br>2. 静态资源传输效率不如 Nginx；<br>3. 难以直接配置 HTTPS。 | 个人测试、快速验证、轻量级日常使用。 |
| **方案 B：Nginx 反向代理 (推荐模式)** | 1. 静态资源由 Nginx 承载，读取极快，支持 Gzip 压缩；<br>2. Node.js 运行在低特权端口（3000），安全稳定；<br>3. 便于未来绑定域名与配置免费 SSL 证书（HTTPS）。 | 需要安装并编写 Nginx 配置规则。 | 正式线上服务、多人共享使用、团队部署。 |

---

### ⚙️ 方案 B：Nginx 配置步骤（若你决定使用 Nginx）

如果你选择使用 Nginx，你的服务端口配置应调整为：**Nginx 监听 90 端口** ➡️ **Node.js 运行在 3000 端口**。

#### 1. 修改 PM2 启动命令为默认的 3000 端口：
```bash
# 清除之前的 pm2 进程并以默认端口 3000 启动
pm2 delete vidfetch
pm2 start server.js --name "vidfetch" # 不指定 PORT 环境变量，默认即为 3000
```

#### 2. 在阿里云服务器上安装并配置 Nginx：
在 `/etc/nginx/conf.d/` 目录下新建配置文件 `vidfetch.conf`：
```bash
sudo nano /etc/nginx/conf.d/vidfetch.conf
```

将以下配置粘贴进去：
```nginx
server {
    listen 90;
    server_name localhost; # 或者是你的阿里云公网 IP / 绑定的域名

    # 开启 Gzip 压缩，显著提升网页加载速度
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # 1. 托管前端静态文件
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
        proxy_connect_timeout 60s;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }
}
```

#### 3. 测试并重启 Nginx：
```bash
sudo nginx -t          # 检查语法是否正确
sudo systemctl restart nginx # 重启 Nginx 使配置生效
```
*(同样，别忘了在阿里云安全组中放行 **90** 端口)*
