const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const { pipeline } = require('stream/promises');
const path = require('path');

const app = express();
app.use(cors()); // 允许前端页面跨域访问我们自己的服务
app.use(express.json());

// db.json 数据存储文件定义与初始化
const DB_FILE = path.join(__dirname, 'db.json');

function initDb() {
    if (!fs.existsSync(DB_FILE)) {
        const initialData = {
            users: [
                {
                    username: 'mediaAdmin',
                    password: 'adminOther9!', // Preset Admin
                    role: 'admin',
                    nickname: '系统管理员',
                    avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=admin',
                    usage: {} // { [dateString]: count }
                },
                {
                    username: 'mediaSuper',
                    password: 'superOther!', // Preset Super User
                    role: 'super',
                    nickname: '超级用户',
                    avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=super',
                    usage: {}
                }
            ],
            logs: [],
            sessions: {} // { [token]: { username, expireAt } }
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf-8');
        console.log('[数据库] 初始化 db.json 完成，已注入默认管理员与超级用户。');
    }
}

initDb();

function readDb() {
    try {
        const content = fs.readFileSync(DB_FILE, 'utf-8');
        return JSON.parse(content);
    } catch (e) {
        console.error('[数据库] 读取失败:', e.message);
        return { users: [], logs: [], sessions: {} };
    }
}

function writeDb(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
        console.error('[数据库] 写入失败:', e.message);
    }
}

// 认证中间件
function authenticate(req, res, next) {
    let token = '';
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
    } else {
        token = req.query.token || (req.body && req.body.token) || '';
    }

    if (!token) {
        return res.status(401).json({ error: 'UNAUTHORIZED', message: '未登录或 Token 缺失，请先登录！' });
    }

    const db = readDb();
    const session = db.sessions[token];

    if (!session) {
        return res.status(401).json({ error: 'UNAUTHORIZED', message: '登录会话已失效，请重新登录！' });
    }

    if (Date.now() > session.expireAt) {
        delete db.sessions[token];
        writeDb(db);
        return res.status(401).json({ error: 'EXPIRED', message: '登录已过期（有效期2天），请重新登录！' });
    }

    const user = db.users.find(u => u.username === session.username);
    if (!user) {
        return res.status(401).json({ error: 'UNAUTHORIZED', message: '该用户不存在或已被删除！' });
    }

    req.user = user;
    req.token = token;
    next();
}

// 审计日志记录
function addLog(username, role, action, targetUrl) {
    const db = readDb();
    db.logs.push({
        timestamp: new Date().toISOString(),
        username: username,
        role: role,
        action: action,
        targetUrl: targetUrl || ''
    });
    if (db.logs.length > 2000) {
        db.logs.shift();
    }
    writeDb(db);
}

// 频率限制校验 (普通用户每天只能下载并提取 5 次，所有用户都记录使用量统计)
function checkAndIncrementLimit(user, increment = false) {
    const today = new Date().toISOString().split('T')[0];
    const db = readDb();
    const dbUser = db.users.find(u => u.username === user.username);
    
    if (!dbUser) {
        return { allowed: false, message: '用户不存在！' };
    }

    if (!dbUser.usage) dbUser.usage = {};
    const count = dbUser.usage[today] || 0;

    if (dbUser.role === 'admin' || dbUser.role === 'super') {
        if (increment) {
            dbUser.usage[today] = count + 1;
            writeDb(db);
            return { allowed: true, count: count + 1 };
        }
        return { allowed: true, count };
    }

    if (increment) {
        if (count >= 5) {
            return { allowed: false, count, message: '今日已达到免费提取上限（5次）' };
        }
        dbUser.usage[today] = count + 1;
        writeDb(db);
        return { allowed: true, count: count + 1 };
    } else {
        if (count > 5) {
            return { allowed: false, count, message: '今日已达到免费提取上限（5次）' };
        }
        return { allowed: true, count };
    }
}

// ==================== 认证相关接口 ====================

// 用户注册 (普通用户)
app.post('/api/auth/register', (req, res) => {
    const { username, password, nickname } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'BAD_REQUEST', message: '用户名或密码不能为空！' });
    }

    const cleanUsername = username.trim();
    if (cleanUsername.length < 3) {
        return res.status(400).json({ error: 'BAD_REQUEST', message: '用户名长度至少为3位！' });
    }

    const db = readDb();
    const existing = db.users.find(u => u.username.toLowerCase() === cleanUsername.toLowerCase());
    if (existing) {
        return res.status(400).json({ error: 'ALREADY_EXISTS', message: '该用户名已被占用，请换一个！' });
    }

    const newUser = {
        username: cleanUsername,
        password: password,
        role: 'user',
        nickname: (nickname || cleanUsername).trim(),
        avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(cleanUsername)}`,
        usage: {}
    };

    db.users.push(newUser);
    writeDb(db);

    res.json({ success: true, message: '注册成功，请使用新账号登录！' });
});

// 用户登录
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'BAD_REQUEST', message: '请输入用户名和密码！' });
    }

    const db = readDb();
    const user = db.users.find(u => u.username === username.trim());

    if (!user || user.password !== password) {
        return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: '用户名或密码输入错误！' });
    }

    // 生成 token 并设置 2 天过期时间
    const token = 'token_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    const expireAt = Date.now() + 2 * 24 * 60 * 60 * 1000;

    db.sessions[token] = {
        username: user.username,
        expireAt: expireAt
    };
    writeDb(db);

    let remaining = 999;
    if (user.role === 'user') {
        const today = new Date().toISOString().split('T')[0];
        const count = user.usage?.[today] || 0;
        remaining = Math.max(0, 5 - count);
    }

    res.json({
        success: true,
        token: token,
        expireAt: expireAt,
        user: {
            username: user.username,
            role: user.role,
            nickname: user.nickname,
            avatar: user.avatar,
            remaining: remaining
        }
    });
});

// 获取当前用户信息
app.get('/api/auth/me', authenticate, (req, res) => {
    const user = req.user;
    let remaining = 999;
    if (user.role === 'user') {
        const today = new Date().toISOString().split('T')[0];
        const count = user.usage?.[today] || 0;
        remaining = Math.max(0, 5 - count);
    }

    res.json({
        success: true,
        user: {
            username: user.username,
            role: user.role,
            nickname: user.nickname,
            avatar: user.avatar,
            remaining: remaining
        }
    });
});

// 更新个人信息
app.post('/api/auth/profile/update', authenticate, (req, res) => {
    const { nickname, avatar, password } = req.body;
    const db = readDb();
    const dbUser = db.users.find(u => u.username === req.user.username);

    if (!dbUser) {
        return res.status(404).json({ error: 'NOT_FOUND', message: '用户不存在！' });
    }

    if (nickname) dbUser.nickname = nickname.trim();
    if (avatar) dbUser.avatar = avatar;
    if (password) dbUser.password = password;

    writeDb(db);

    res.json({
        success: true,
        message: '个人信息更新成功！',
        user: {
            username: dbUser.username,
            role: dbUser.role,
            nickname: dbUser.nickname,
            avatar: dbUser.avatar
        }
    });
});

// ==================== 管理员相关接口 ====================

// 获取所有用户账号 (仅 Admin)
app.get('/api/admin/users', authenticate, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'FORBIDDEN', message: '无权操作：仅系统管理员可见！' });
    }

    const db = readDb();
    const cleanUsers = db.users.map(u => ({
        username: u.username,
        role: u.role,
        nickname: u.nickname,
        avatar: u.avatar,
        usage: u.usage || {}
    }));

    res.json({ success: true, users: cleanUsers });
});

// 创建用户账号 (仅 Admin)
app.post('/api/admin/users/create', authenticate, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'FORBIDDEN', message: '无权操作：仅系统管理员可行！' });
    }

    const { username, password, role, nickname } = req.body;
    if (!username || !password || !role) {
        return res.status(400).json({ error: 'BAD_REQUEST', message: '参数不足，必须提供用户名、密码和角色！' });
    }

    const cleanUsername = username.trim();
    const db = readDb();
    const existing = db.users.find(u => u.username.toLowerCase() === cleanUsername.toLowerCase());
    if (existing) {
        return res.status(400).json({ error: 'ALREADY_EXISTS', message: '该用户名已存在！' });
    }

    // 限制 admin 和 super 角色只能有一个
    if (role === 'admin' || role === 'super') {
        const count = db.users.filter(u => u.role === role).length;
        if (count >= 1) {
            return res.status(400).json({ error: 'LIMIT_REACHED', message: `系统限制：${role === 'admin' ? '系统管理员' : '超级用户'}只能包含一个！` });
        }
    }

    const newUser = {
        username: cleanUsername,
        password: password,
        role: role,
        nickname: (nickname || cleanUsername).trim(),
        avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(cleanUsername)}`,
        usage: {}
    };

    db.users.push(newUser);
    writeDb(db);

    res.json({ success: true, message: '账号创建成功！' });
});

// 删除用户账号 (仅 Admin)
app.post('/api/admin/users/delete', authenticate, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'FORBIDDEN', message: '无权操作：仅系统管理员可行！' });
    }

    const { username } = req.body;
    if (!username) {
        return res.status(400).json({ error: 'BAD_REQUEST', message: '请指定要删除的用户名！' });
    }

    if (username === 'mediaAdmin' || username === 'mediaSuper') {
        return res.status(400).json({ error: 'PROTECTED', message: '系统内置管理员和超级用户无法被删除！' });
    }

    const db = readDb();
    const index = db.users.findIndex(u => u.username === username);
    if (index === -1) {
        return res.status(404).json({ error: 'NOT_FOUND', message: '未找到该用户账号！' });
    }

    db.users.splice(index, 1);
    
    // 清理该用户的会话
    Object.keys(db.sessions).forEach(token => {
        if (db.sessions[token].username === username) {
            delete db.sessions[token];
        }
    });

    writeDb(db);
    res.json({ success: true, message: '账号删除成功！' });
});

// 获取操作审计日志 (仅 Admin)
app.get('/api/admin/logs', authenticate, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'FORBIDDEN', message: '无权操作：仅系统管理员可行！' });
    }

    const db = readDb();
    const sortedLogs = [...db.logs].reverse();
    res.json({ success: true, logs: sortedLogs });
});

// 启发式 AI 本地智能总结引擎
function generateAISummary(title, desc, platform) {
    const fullText = ((title || '') + '。' + (desc || '')).trim();
    
    // 1. 智能判别视频所属领域
    let category = "生活娱乐 & 综合创作";
    const textLower = fullText.toLowerCase();
    if (textLower.includes("code") || textLower.includes("编程") || textLower.includes("开发") || textLower.includes("ai") || textLower.includes("人工智能") || textLower.includes("gpt") || textLower.includes("科技") || textLower.includes("大模型") || textLower.includes("软件")) {
        category = "科技前沿 & 编程技术";
    } else if (textLower.includes("mv") || textLower.includes("音乐") || textLower.includes("歌") || textLower.includes("music") || textLower.includes("concert") || textLower.includes("声乐") || textLower.includes("演奏")) {
        category = "音乐艺术 & 视听盛宴";
    } else if (textLower.includes("教程") || textLower.includes("怎么") || textLower.includes("如何") || textLower.includes("tutorial") || textLower.includes("learn") || textLower.includes("科普") || textLower.includes("知识") || textLower.includes("历史") || textLower.includes("科学")) {
        category = "知识科普 & 技能教程";
    } else if (textLower.includes("美食") || textLower.includes("吃") || textLower.includes("探店") || textLower.includes("cooking") || textLower.includes("food") || textLower.includes("做菜") || textLower.includes("美味") || textLower.includes("餐厅")) {
        category = "美食分享 & 探店推荐";
    } else if (textLower.includes("搞笑") || textLower.includes("哈哈") || textLower.includes("段子") || textLower.includes("funny") || textLower.includes("整蛊") || textLower.includes("鬼畜")) {
        category = "趣味幽默 & 解压娱乐";
    } else if (textLower.includes("穿搭") || textLower.includes("美妆") || textLower.includes("时尚") || textLower.includes("ootd") || textLower.includes("护肤") || textLower.includes("彩妆")) {
        category = "时尚美妆 & 潮流生活";
    } else if (textLower.includes("游戏") || textLower.includes("game") || textLower.includes("王者") || textLower.includes("英雄联盟") || textLower.includes("单机") || textLower.includes("手游")) {
        category = "游戏电竞 & 娱乐解说";
    }

    // 2. 核心看点提炼：基于句子权重算法的本地抽取式摘要 (Extractive Summarization)
    const sentences = fullText.split(/[。！？；!?;\n\r]+/)
        .map(s => s.trim())
        .filter(s => s.length >= 6 && s.length <= 150); // 过滤过短或过长的句子

    let points = [];
    if (sentences.length > 0) {
        // 计算词频 (中英文轻量化权重计算)
        const wordFreq = {};
        const stopWords = new Set(["的", "了", "在", "是", "我", "你", "他", "它", "们", "这", "那", "有", "无", "和", "与", "就", "都", "而", "及", "并", "得", "着", "也", "且", "这", "对", "个", "中", "上", "下", "里", "来", "去", "要", "会", "能", "可", "以", "的", "the", "a", "an", "and", "or", "but", "is", "are", "was", "were", "to", "of", "in", "on", "at", "for", "with"]);
        
        sentences.forEach(sentence => {
            const words = sentence.split(/[\s,，.、:：(（)）]+/).flatMap(w => {
                if (/^[a-zA-Z]+$/.test(w)) return [w.toLowerCase()]; // 英文单词
                const tokens = [];
                for (let i = 0; i < w.length; i++) {
                    tokens.push(w[i]); // 单字
                    if (i < w.length - 1) tokens.push(w.slice(i, i + 2)); // 双字滑动窗口
                }
                return tokens;
            });

            words.forEach(w => {
                if (w.length > 1 && !stopWords.has(w)) {
                    wordFreq[w] = (wordFreq[w] || 0) + 1;
                }
            });
        });

        // 对句子评分
        const sentenceScores = sentences.map((sentence, idx) => {
            let score = 0;
            const words = sentence.split(/[\s,，.、:：(（)）]+/).flatMap(w => {
                if (/^[a-zA-Z]+$/.test(w)) return [w.toLowerCase()];
                const tokens = [];
                for (let i = 0; i < w.length; i++) {
                    tokens.push(w[i]);
                    if (i < w.length - 1) tokens.push(w.slice(i, i + 2));
                }
                return tokens;
            });
            words.forEach(w => {
                if (wordFreq[w]) score += wordFreq[w];
            });
            score = score / (sentence.length || 1); // 归一化长度
            score += (10 / (idx + 1)); // 句首位置奖励
            return { text: sentence, score };
        });

        // 排序并筛选（去重高相似度句子）
        sentenceScores.sort((a, b) => b.score - a.score);
        const selected = [];
        for (const item of sentenceScores) {
            const isDuplicate = selected.some(s => {
                const commonChars = [...s].filter(c => item.text.includes(c)).length;
                return commonChars / Math.min(s.length, item.text.length) > 0.6;
            });
            if (!isDuplicate) {
                selected.push(item.text);
            }
            if (selected.length >= 3) break;
        }
        
        points = selected;
    }

    // 兜底看点
    if (points.length < 3) {
        // 从全文本中提取一些有意义的关键词 (去重，去掉常见停用词)
        const stopWords = new Set(["的", "了", "在", "是", "我", "你", "他", "它", "们", "这", "那", "有", "无", "和", "与", "就", "都", "而", "及", "并", "得", "着", "也", "且", "对", "个", "中", "上", "下", "里", "来", "去", "要", "会", "能", "可", "以", "视频", "平台", "热门", "评论", "标签", "没有", "一个", "自己", "这个", "我们", "什么", "怎么"]);
        const rawWords = fullText.split(/[\s,，.、:：(（)）《》#。！？；!?;\n\r]+/g)
            .filter(w => w.length >= 2 && w.length <= 10 && !stopWords.has(w));
        const keywords = Array.from(new Set(rawWords)).slice(0, 5);

        const dynamicPoints = [
            `本视频围绕主题“${title || '精彩内容'}”展开，通过画面呈现了作者的创作视域。`,
            keywords.length > 0
                ? `内容中提取到“${keywords.join('、')}”等高频词与叙事线索，信息表达凝练直白。`
                : `视频叙事风格清晰，节奏轻快，整体能让观众在短时间内迅速抓住作品的核心方向。`,
            `作品体现了作者在【${category}】领域的个性化表达，展现了良好的互动观赏价值。`
        ];

        while (points.length < 3) {
            points.push(dynamicPoints[points.length]);
        }
    }

    // 3. 智能行动建议
    let suggestion = "建议收藏并结合视频原网页进行高频观看，获取完整体验。";
    if (category === "科技前沿 & 编程技术") {
        suggestion = "建议对涉及的技术栈或AI工具进行本地搭建复现，实操以加深理解。";
    } else if (category === "音乐艺术 & 视听盛宴") {
        suggestion = "推荐佩戴耳机以获取无损解析音质效果，沉浸式体会视听艺术的细节张力。";
    } else if (category === "知识科普 & 技能教程") {
        suggestion = "内容属于典型的高密度干货，建议保存文案并建立思维导图，用于日后温故知新。";
    } else if (category === "美食分享 & 探店推荐") {
        suggestion = "建议作为周末聚餐或下厨做菜的参考指南，适合与家人朋友共同分享这份烟火温情。";
    }

    return {
        category,
        points,
        suggestion
    };
}

// 核心自研技术：无头浏览器网络层嗅探
app.post('/api/parse', authenticate, async (req, res) => {
    let { url, apiKey, endpointId, accessKey } = req.body;
    if (!url) return res.status(400).json({ error: '请提供视频链接' });

    // 校验频率限制并扣减次数 (仅普通用户)
    const limitCheck = checkAndIncrementLimit(req.user, true);
    if (!limitCheck.allowed) {
        return res.status(403).json({ error: 'LIMIT_EXCEEDED', message: limitCheck.message });
    }

    // 提取真实的 HTTP/HTTPS 链接以清洗分享文本中的冗余内容
    const urlMatch = url.match(/(https?:\/\/[a-zA-Z0-9\-._~:/?#\[\]@!$&'()*+,;=]+)/);
    if (urlMatch) {
        url = urlMatch[0];
    } else {
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }
    }

    // 🔑 外网访问密钥校验（仅针对 YouTube, TikTok 等海外平台）
    const isOverseas = url.includes('youtube.com') || url.includes('youtu.be') || url.includes('tiktok.com');
    if (isOverseas) {
        const expectedKey = process.env.ACCESS_KEY || '1qaz789';
        if (!accessKey || accessKey !== expectedKey) {
            console.log(`[密钥验证] 未提供密钥或密钥错误。用户输入: "${accessKey || ''}"`);
            return res.status(403).json({ error: 'KEY_REQUIRED', message: '解析此海外平台视频需要正确的外网访问密钥！' });
        }
        console.log(`[密钥验证] 校验通过，允许解析海外平台视频`);
    }

    // 1. 如果是 B站 链接，先尝试通过直接 API 获取，避免启动无头浏览器（极速且稳定）
    const isBilibili = url.includes('bilibili.com') || url.includes('b23.tv');
    if (isBilibili) {
        try {
            let directUrl = url;
            // 如果是短链接，进行 302 重定向解析
            if (directUrl.includes('b23.tv')) {
                const redirectRes = await axios.get(directUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
                    maxRedirects: 5
                });
                directUrl = redirectRes.request.res.responseUrl || directUrl;
            }

            let bvid = null;
            let aid = null;
            const bvidMatch = directUrl.match(/\/video\/(BV[a-zA-Z0-9]+)/i);
            if (bvidMatch) {
                bvid = bvidMatch[1];
            } else {
                const aidMatch = directUrl.match(/\/video\/av([0-9]+)/i);
                if (aidMatch) aid = aidMatch[1];
            }

            if (bvid || aid) {
                console.log(`[B站直接解析] 检测到Bvid: ${bvid || '无'} / Aid: ${aid || '无'}，开始直接调用API解析...`);
                const viewUrl = bvid 
                    ? `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`
                    : `https://api.bilibili.com/x/web-interface/view?aid=${aid}`;

                const viewRes = await axios.get(viewUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Referer': 'https://www.bilibili.com'
                    }
                });

                if (viewRes.data.code === 0 && viewRes.data.data) {
                    const videoData = viewRes.data.data;
                    const finalCid = videoData.cid;
                    const finalAid = videoData.aid;
                    const finalBvid = videoData.bvid || bvid;
                    const title = (videoData.title || 'B站视频').replace("_哔哩哔哩_bilibili", "").replace("_bilibili", "");
                    const cover = videoData.pic ? (videoData.pic.startsWith('//') ? 'https:' + videoData.pic : videoData.pic) : '';
                    let description = videoData.desc || '';

                    // ⚡ 极客数据增强：获取 B站 视频的标签(Tags)和热门评论(Hot Comments)作为文本补充
                    let tagsList = [];
                    try {
                        const tagsRes = await axios.get(`https://api.bilibili.com/x/tag/archive/tags?bvid=${finalBvid}`, {
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                                'Referer': 'https://www.bilibili.com'
                            }
                        });
                        if (tagsRes.data.code === 0 && tagsRes.data.data) {
                            tagsList = tagsRes.data.data.map(t => t.tag_name);
                        }
                    } catch (err) {
                        console.log(`[B站直接解析] 获取标签失败: ${err.message}`);
                    }

                    let hotComments = [];
                    try {
                        const replyRes = await axios.get(`https://api.bilibili.com/x/v2/reply?type=1&oid=${finalAid}&sort=2`, {
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                                'Referer': 'https://www.bilibili.com'
                            }
                        });
                        if (replyRes.data.code === 0 && replyRes.data.data && replyRes.data.data.replies) {
                            hotComments = replyRes.data.data.replies.slice(0, 5).map(r => r.content.message);
                        }
                    } catch (err) {
                        console.log(`[B站直接解析] 获取热门评论失败: ${err.message}`);
                    }

                    // 组合丰富的数据文案
                    let rawExtractText = description || '';
                    if (tagsList.length > 0) {
                        rawExtractText += (rawExtractText ? '。' : '') + `视频标签: ${tagsList.join('、')}`;
                    }
                    if (hotComments.length > 0) {
                        rawExtractText += (rawExtractText ? '。' : '') + `热门评论: ${hotComments.join('；')}`;
                    }
                    if (!rawExtractText) {
                        rawExtractText = '暂无详细描述文案';
                    }

                    // 获取播放地址
                    const playRes = await axios.get(`https://api.bilibili.com/x/player/playurl?avid=${finalAid}&bvid=${finalBvid}&cid=${finalCid}&qn=80&fnval=0&fnver=0&fourk=1&otype=json`, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            'Referer': 'https://www.bilibili.com'
                        }
                    });

                    if (playRes.data.code === 0 && playRes.data.data?.durl?.[0]?.url) {
                        const videoSrc = playRes.data.data.durl[0].url;
                        console.log(`[B站直接解析] 🎉 成功获取 MP4 直链 (qn=80)`);

                        // 净化空白字符，但保留完整段落和换行以维持可读性
                        rawExtractText = rawExtractText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

                        addLog(req.user.username, req.user.role, '解析并提取视频', url);
                        return res.json({
                            success: true,
                            videoUrl: videoSrc,
                            targetUrl: url,
                            title: title,
                            cover: cover,
                            platform: 'Bilibili',
                            description: rawExtractText || '暂无详细描述文案'
                        });
                    }
                }
            }
        } catch (e) {
            console.warn(`[B站直接解析] 接口调用失败，自动降级为 Puppeteer 浏览器嗅探:`, e.message);
        }
    }

    console.log(`[解析引擎] 正在启动无头浏览器，目标: ${url}`);
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-web-security',
                '--autoplay-policy=no-user-gesture-required'
            ]
        });
        const page = await browser.newPage();

        const isBilibili = url.includes('bilibili.com') || url.includes('b23.tv');
        const isXiaohongshu = url.includes('xiaohongshu.com') || url.includes('xhslink.com');
        const isTikTok = url.includes('tiktok.com');
        const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');

        if (isBilibili) {
            // 使用 iPad UA，既不会像手机端那样被强制唤起 Bilibili App，又不会像 PC 端那样默认采用音视频分离的 DASH 流，而是直接返回完整的 MP4 直链！
            await page.setUserAgent('Mozilla/5.0 (iPad; CPU OS 16_6 like Mac Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1');
        } else if (isYouTube) {
            // YouTube 使用 iPhone UA 并配合禁用 MSE，使其返回 progressive MP4 直链
            await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1');
            // 禁用 MediaSource Extensions 强制 YouTube 降级为 MP4 直链播放
            await page.evaluateOnNewDocument(() => {
                Object.defineProperty(window, 'MediaSource', {
                    get: () => undefined,
                    configurable: true
                });
                Object.defineProperty(window, 'WebKitMediaSource', {
                    get: () => undefined,
                    configurable: true
                });
            });
        } else {
            // 抖音、小红书、TikTok 等其它平台使用手机 UA 触发轻量版/触屏版
            await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1');
        }

        let videoSrc = null;
        let description = '';
        let pageSubtitleUrl = null;

        let resolveIntercept;
        const interceptPromise = new Promise(resolve => {
            resolveIntercept = resolve;
        });

        // 核心技术：开启底层请求拦截，篡改 API 参数强行获取 MP4 格式与超清画质
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            const reqUrl = request.url();

            // ⚡ 核心提速与去水印：拦截抖音视频播放请求，直接提取 Video ID 组装 1080p 无水印直链
            if (reqUrl.includes('aweme/v1/play') || reqUrl.includes('video_id=')) {
                try {
                    const match = reqUrl.match(/video_id=([a-zA-Z0-9_]+)/);
                    if (match && !videoSrc) {
                        const videoId = match[1];
                        videoSrc = `https://aweme.snssdk.com/aweme/v1/play/?video_id=${videoId}&ratio=1080p`;
                        console.log(`[请求拦截] 成功截获抖音 Video ID: ${videoId}，重构 1080p 无水印直链`);
                        if (resolveIntercept) resolveIntercept();
                    }
                } catch (e) { }
            }

            if (reqUrl.includes('/x/player/wbi/playurl') || reqUrl.includes('/x/player/playurl')) {
                try {
                    const parsedUrl = new URL(reqUrl);
                    parsedUrl.pathname = '/x/player/playurl'; // 更改路径为非 WBI 接口以规避签名验证错误！
                    parsedUrl.searchParams.set('fnval', '0'); // fnval=0 代表强制返回 MP4 直链，而不是音视频分离 of DASH (fnval=80/4048)
                    parsedUrl.searchParams.set('qn', '80');    // qn=80 强制向B站索要 1080p 最高清晰度（游客最高可自动下发 720p/480p，避免默认的 360p 渣画质）
                    parsedUrl.searchParams.delete('w_rid');   // 清除 WBI 签名，避免由于参数被修改导致签名失效被拦截
                    parsedUrl.searchParams.delete('wts');
                    request.continue({ url: parsedUrl.toString() });
                    console.log(`[拦截请求] 成功将B站 WBI 播放接口改写为普通接口并篡改参数 (fnval=0, qn=80)`);
                    return;
                } catch (e) { }
            }

            // ⚡ 拦截 YouTube 视频播放请求，获取直接播放的 MP4 视频直链
            if (reqUrl.includes('googlevideo.com/videoplayback')) {
                try {
                    const parsedUrl = new URL(reqUrl);
                    const mime = parsedUrl.searchParams.get('mime');
                    if (mime && mime.includes('video/mp4') && !videoSrc) {
                        videoSrc = reqUrl;
                        console.log(`[请求拦截] 成功拦截到 YouTube MP4 视频直链: ${videoSrc.substring(0, 60)}...`);
                        if (resolveIntercept) resolveIntercept();
                    }
                } catch (e) { }
            }

            request.continue();
        });

        // 监听底层网络请求，暴力拦截媒体流及接口数据作为兜底
        page.on('response', async (response) => {
            if (videoSrc) return;
            const reqUrl = response.url();

            // 1. 拦截抖音 API
            if (reqUrl.includes('/aweme/detail/') || reqUrl.includes('/aweme/post/') || reqUrl.includes('/aweme/iteminfo/')) {
                try {
                    const json = await response.json();
                    const item = json.aweme_detail || (json.aweme_list && json.aweme_list[0]);
                    if (item) {
                        description = item.desc || description || '';
                        
                        const playUrl = item.video?.play_addr?.url_list?.[0] || item.video?.play_addr_h264?.url_list?.[0];
                        if (playUrl) {
                            videoSrc = playUrl;
                            console.log(`[嗅探成功] 拦截到抖音播放直链，文案长度: ${description.length}`);
                        }

                        // 尝试提取抖音自带的 ASR 字幕 / CC 字幕
                        try {
                            const subtitleInfos = item.video?.subtitle_infos || item.video?.subtitle_list;
                            if (subtitleInfos && subtitleInfos.length > 0) {
                                const subUrl = subtitleInfos[0].webvtt_url || subtitleInfos[0].url;
                                if (subUrl) {
                                    console.log(`[抖音字幕检测] 发现抖音原生字幕，已记录地址`);
                                    pageSubtitleUrl = subUrl;
                                }
                            }
                        } catch (subErr) { }

                        if (videoSrc && resolveIntercept) {
                            resolveIntercept();
                        }
                    }
                } catch (e) { }
            }

            // 2. 拦截B站 API
            if (reqUrl.includes('/x/player/wbi/playurl') || reqUrl.includes('/x/player/playurl')) {
                try {
                    const json = await response.json();
                    if (json?.data?.durl?.[0]?.url) {
                        videoSrc = json.data.durl[0].url;
                        console.log(`[嗅探成功] 拦截到B站API直链 (DURL)`);
                        if (resolveIntercept) resolveIntercept();
                    } else if (json?.data?.dash?.video?.[0]?.baseUrl) {
                        videoSrc = json.data.dash.video[0].baseUrl;
                        console.log(`[嗅探成功] 拦截到B站API直链 (DASH)`);
                        if (resolveIntercept) resolveIntercept();
                    }
                } catch (e) { }
            }

            // 3. 拦截 YouTube 视频流 (作为兜底)
            if (reqUrl.includes('googlevideo.com/videoplayback')) {
                try {
                    const parsedUrl = new URL(reqUrl);
                    const mime = parsedUrl.searchParams.get('mime');
                    if (mime && mime.includes('video/mp4') && !videoSrc) {
                        videoSrc = reqUrl;
                        console.log(`[嗅探成功] 拦截到 YouTube MP4 视频直链 (DASH/Progressive)`);
                        if (resolveIntercept) resolveIntercept();
                    }
                } catch (e) { }
            }

            // 4. 匹配常规的视频流后缀或 Content-Type (作为 Fallback)
            const contentType = response.headers()['content-type'] || '';
            if (contentType.includes('video/') || reqUrl.includes('.mp4?') || reqUrl.includes('video/tos') || reqUrl.includes('mimeType=video_mp4')) {
                // 排除一些杂乱的短视频广告请求，抓取主视频流
                if (!reqUrl.includes('.m3u8') && !reqUrl.includes('.ts')) {
                    videoSrc = reqUrl;
                    console.log(`[嗅探成功] 拦截到通用视频直链: ${reqUrl.substring(0, 50)}...`);
                    if (resolveIntercept) resolveIntercept();
                }
            }
        });

        // 访问目标页面并等待其加载
        const navPromise = page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(e => {
            console.log("页面加载超时或被中断...");
        });

        // 只要拦截到了或者页面加载完了（不管是否超时），就继续往下走
        await Promise.race([interceptPromise, navPromise]);

        // 如果是通过 navPromise 结束的，给一点时间确保 DOM 完全渲染
        if (!videoSrc) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // 如果网络层没拦截到，尝试在 DOM 元素中提取或者全局变量中提取
        let title = "未知视频";
        let cover = "";
        let platform = "通用网页";
        if (isBilibili) platform = "Bilibili";
        else if (url.includes("douyin.com")) platform = "抖音";
        else if (isXiaohongshu) platform = "小红书";
        else if (isTikTok) platform = "TikTok";
        else if (isYouTube) platform = "YouTube";

        // 提取元数据与文案描述
        const pageMeta = await page.evaluate(() => {
            let extractedTitle = document.title;
            let extractedCover = "";
            let extractedDesc = "";

            // 尝试获取更准确的 Title
            const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
            if (ogTitle) extractedTitle = ogTitle;

            // 尝试获取 Cover / Thumbnail
            const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content')
                || document.querySelector('meta[property="twitter:image"]')?.getAttribute('content');
            if (ogImage) {
                extractedCover = ogImage;
            } else {
                // 通用封面提取
                const img = document.querySelector('video')?.getAttribute('poster')
                    || document.querySelector('img[src*="cover"]')?.getAttribute('src');
                if (img) extractedCover = img;
            }

            // 尝试获取文案 (Description/Caption)
            let bDesc = '';
            try {
                if (window.__INITIAL_STATE__ && window.__INITIAL_STATE__.videoData && window.__INITIAL_STATE__.videoData.desc) {
                    bDesc = window.__INITIAL_STATE__.videoData.desc;
                }
            } catch (e) { }

            extractedDesc = bDesc
                || document.querySelector('meta[name="description"]')?.getAttribute('content')
                || document.querySelector('meta[property="og:description"]')?.getAttribute('content')
                || document.querySelector('.desc-info-text')?.innerText
                || document.querySelector('.desc')?.innerText
                || document.querySelector('.note-text')?.innerText
                || '';

            return { title: extractedTitle, cover: extractedCover, desc: extractedDesc };
        }).catch(() => ({ title: "视频已解析", cover: "", desc: "" }));

        title = pageMeta.title || title;
        cover = pageMeta.cover || cover;
        if (!description) {
            description = pageMeta.desc || '';
        }

        // 特殊平台的封面/标题提取优化
        if (isBilibili) {
            title = title.replace("_哔哩哔哩_bilibili", "").replace("_bilibili", "");
        } else if (platform === "抖音") {
            title = title.replace("- 抖音", "");
        } else if (platform === "小红书") {
            title = title.replace("- 小红书", "").replace("_小红书", "");
        } else if (platform === "YouTube") {
            title = title.replace(" - YouTube", "");
        }

        // ⚡ 极客数据增强：如果网络层没能拦截到详细文案，或文案为空，通过 B站 API 补充标签与热门评论
        if (isBilibili) {
            let tagsList = [];
            let finalAid = null;
            let finalBvid = null;
            try {
                const bvidMatch = url.match(/\/video\/(BV[a-zA-Z0-9]+)/i);
                finalBvid = bvidMatch ? bvidMatch[1] : null;

                const metaInfo = await page.evaluate(() => {
                    if (window.__INITIAL_STATE__ && window.__INITIAL_STATE__.videoData) {
                        return {
                            aid: window.__INITIAL_STATE__.videoData.aid,
                            bvid: window.__INITIAL_STATE__.videoData.bvid
                        };
                    }
                    return null;
                });
                if (metaInfo) {
                    finalAid = metaInfo.aid;
                    if (!finalBvid) finalBvid = metaInfo.bvid;
                }

                if (finalBvid) {
                    const tagsRes = await axios.get(`https://api.bilibili.com/x/tag/archive/tags?bvid=${finalBvid}`, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            'Referer': 'https://www.bilibili.com'
                        }
                    });
                    if (tagsRes.data.code === 0 && tagsRes.data.data) {
                        tagsList = tagsRes.data.data.map(t => t.tag_name);
                    }
                }

                if (finalAid) {
                    const replyRes = await axios.get(`https://api.bilibili.com/x/v2/reply?type=1&oid=${finalAid}&sort=2`, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            'Referer': 'https://www.bilibili.com'
                        }
                    });
                    if (replyRes.data.code === 0 && replyRes.data.data && replyRes.data.data.replies) {
                        const hotComments = replyRes.data.data.replies.slice(0, 5).map(r => r.content.message);
                        if (hotComments.length > 0) {
                            description += (description ? '。' : '') + `热门评论: ${hotComments.join('；')}`;
                        }
                    }
                }

                if (tagsList.length > 0) {
                    description += (description ? '。' : '') + `视频标签: ${tagsList.join('、')}`;
                }
            } catch (err) {
                console.log("[B站嗅探数据增强] 失败:", err.message);
            }
        }

        // ⚡ 极客核心突破：B站/YouTube/抖音 CC/AI 语音转文字字幕实时提取！
        let transcript = '';
        if (isBilibili) {
            try {
                const subtitleInfo = await page.evaluate(() => {
                    if (window.__INITIAL_STATE__ && window.__INITIAL_STATE__.videoData) {
                        const subtitle = window.__INITIAL_STATE__.videoData.subtitle;
                        return subtitle ? subtitle.list : null;
                    }
                    return null;
                });

                if (subtitleInfo && subtitleInfo.length > 0) {
                    const subUrl = subtitleInfo[0].subtitle_url;
                    if (subUrl) {
                        const cleanSubUrl = subUrl.startsWith('//') ? 'https:' + subUrl : subUrl;
                        console.log(`[B站字幕提取] 检测到B站AI语音字幕，正在启动浏览器内部抓取: ${cleanSubUrl}`);

                        // 在 Puppeteer 页面环境内部发起 fetch 请求以避开所有 CORS 与鉴权限制
                        const subContent = await page.evaluate(async (url) => {
                            const res = await fetch(url);
                            const json = await res.json();
                            return json.body.map(item => item.content).join(' ');
                        }, cleanSubUrl);

                        if (subContent) {
                            transcript = subContent;
                            console.log(`[B站字幕提取] 成功抓取B站整段视频 AI 语音字幕，字数: ${transcript.length}`);
                        }
                    }
                }
            } catch (e) {
                console.log("[B站字幕提取] 抓取失败:", e.message);
            }
        } else if (isYouTube) {
            try {
                const ytCaptions = await page.evaluate(() => {
                    try {
                        if (window.ytInitialPlayerResponse && window.ytInitialPlayerResponse.captions) {
                            const tracklist = window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer;
                            if (tracklist && tracklist.captionTracks) {
                                return tracklist.captionTracks;
                            }
                        }
                    } catch (e) {}
                    return null;
                });

                if (ytCaptions && ytCaptions.length > 0) {
                    // 优先提取中文，否则提取第一个
                    const track = ytCaptions.find(t => t.languageCode && t.languageCode.startsWith('zh')) || ytCaptions[0];
                    const subUrl = track.baseUrl;
                    if (subUrl) {
                        console.log(`[YouTube字幕提取] 检测到YouTube原生字幕，正在进行抓取: ${subUrl.substring(0, 80)}...`);
                        const subContent = await page.evaluate(async (url) => {
                            const res = await fetch(url);
                            const xml = await res.text();
                            const tempEl = document.createElement('div');
                            const matches = xml.match(/<text[^>]*>([\s\S]*?)<\/text>/g);
                            if (matches) {
                                return matches.map(m => {
                                    const content = m.replace(/<text[^>]*>|<\/text>/g, '');
                                    tempEl.innerHTML = content;
                                    return tempEl.innerText;
                                }).join(' ');
                            }
                            return '';
                        }, subUrl);

                        if (subContent) {
                            transcript = subContent;
                            console.log(`[YouTube字幕提取] 成功获取 YouTube 视频字幕，字数: ${transcript.length}`);
                        }
                    }
                }
            } catch (e) {
                console.log("[YouTube字幕提取] 抓取失败:", e.message);
            }
        } else if (pageSubtitleUrl) {
            try {
                console.log(`[抖音字幕提取] 正在抓取抖音原生字幕...`);
                const subContent = await page.evaluate(async (url) => {
                    const res = await fetch(url);
                    const text = await res.text();
                    // 简单的 WebVTT 解析：移除 WEBVTT 头和时间戳行
                    return text.split('\n')
                        .filter(line => !line.includes('-->') && !line.startsWith('WEBVTT') && line.trim() !== '')
                        .join(' ')
                        .replace(/\s+/g, ' ')
                        .trim();
                }, pageSubtitleUrl);

                if (subContent) {
                    transcript = subContent;
                    console.log(`[抖音字幕提取] 成功获取抖音视频字幕，字数: ${transcript.length}`);
                }
            } catch (e) {
                console.log("[抖音字幕提取] 抓取失败:", e.message);
            }
        }

        if (!videoSrc) {
            videoSrc = await page.evaluate(() => {
                // B站特有全局变量
                if (window.__playinfo__) {
                    if (window.__playinfo__.data?.durl?.[0]?.url) {
                        return window.__playinfo__.data.durl[0].url;
                    }
                    if (window.__playinfo__.data?.dash?.video?.[0]?.baseUrl) {
                        return window.__playinfo__.data.dash.video[0].baseUrl;
                    }
                }

                // 抖音 PC 端可能存在 RENDER_DATA
                try {
                    const renderDataEl = document.getElementById('RENDER_DATA');
                    if (renderDataEl) {
                        const strData = renderDataEl.innerText;
                        const match = strData.match(/(https?:\/\/[^\"]*(?:douyinvod|video\/tos)[^\"]*)/);
                        if (match) return decodeURIComponent(match[1]);
                    }
                } catch (e) { }

                // 抖音手机端可能在 _ROUTER_DATA 中
                try {
                    if (window._ROUTER_DATA) {
                        // 1. 结构化路径提取 (更精准稳定)
                        let playAddr = null;
                        const loaderData = window._ROUTER_DATA.loaderData;
                        if (loaderData) {
                            for (const key in loaderData) {
                                if (loaderData[key] && loaderData[key].videoInfoRes) {
                                    const itemList = loaderData[key].videoInfoRes.item_list;
                                    if (itemList && itemList[0] && itemList[0].video && itemList[0].video.play_addr) {
                                        const urlList = itemList[0].video.play_addr.url_list;
                                        if (urlList && urlList.length > 0) {
                                            playAddr = urlList[0];
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                        if (playAddr) return playAddr;

                        // 2. 正则兜底提取 (包含新发现的 snssdk 和 iesdouyin 域名)
                        const strData = JSON.stringify(window._ROUTER_DATA);
                        const match = strData.match(/(https?:\/\/[^\"]*(?:douyinvod|video\/tos|aweme\.snssdk\.com|iesdouyin\.com\/aweme\/v1\/play)[^\"]*)/);
                        if (match) return match[1];
                    }
                } catch (e) { }

                // 通用 video 标签兜底
                const videoEl = document.querySelector('video');
                if (videoEl) {
                    const src = videoEl.getAttribute('src') || videoEl.src;
                    if (src && !src.startsWith('blob:')) {
                        return src;
                    }
                }
                // 尝试找 source 标签
                const sourceEl = document.querySelector('video source');
                if (sourceEl) {
                    const src = sourceEl.getAttribute('src') || sourceEl.src;
                    if (src) return src;
                }

                // 实在没有，看看页面里有没有直接暴露的带 video/tos 或 douyinvod 的链接
                const htmlMatch = document.body ? document.body.innerHTML.match(/(https?:\/\/[^\"]*(?:douyinvod|video\/tos)[^\"]*)/) : null;
                if (htmlMatch) {
                    return htmlMatch[1].replace(/\\u002F/g, '/');
                }

                return null;
            });
        }

        await browser.close();

        // 统一做链接相对路径及协议头修正
        if (videoSrc && !videoSrc.startsWith('http://') && !videoSrc.startsWith('https://')) {
            if (videoSrc.startsWith('//')) {
                videoSrc = 'https:' + videoSrc;
            } else {
                try {
                    const currentUrl = page.url();
                    const parsedUrl = new URL(currentUrl);
                    videoSrc = new URL(videoSrc, parsedUrl.origin).toString();
                    console.log(`[相对路径修正] 已将相对路径修正为绝对路径 (根据当前页面: ${currentUrl}): ${videoSrc}`);
                } catch (e) {
                    try {
                        const parsedUrl = new URL(url);
                        videoSrc = new URL(videoSrc, parsedUrl.origin).toString();
                    } catch (err) {}
                }
            }
        }

        // ⚡ 极客核心去水印与去片尾逻辑
        if (videoSrc) {
            if (videoSrc.includes('douyin.com') || videoSrc.includes('iesdouyin.com') || videoSrc.includes('aweme.snssdk.com') || videoSrc.includes('douyinvod.com')) {
                // 1. 强制将带水印的 playwm 替换为无水印无片尾的 play
                if (videoSrc.includes('/playwm/')) {
                    videoSrc = videoSrc.replace('/playwm/', '/play/');
                    console.log(`[去水印优化] 已成功将抖音 playwm 链接替换为无水印 play 直链: ${videoSrc}`);
                }

                // 2. 移除 water_mark 参数，强制 1080p 超清画质
                try {
                    const parsed = new URL(videoSrc);
                    if (parsed.searchParams.has('water_mark')) {
                        parsed.searchParams.delete('water_mark');
                    }
                    parsed.searchParams.set('ratio', '1080p');
                    videoSrc = parsed.toString();
                } catch (e) { }
            }
        }

        // 封面图协议补全
        if (cover && cover.startsWith('//')) {
            cover = 'https:' + cover;
        }

        if (videoSrc) {
            let rawExtractText = description || '';
            rawExtractText = rawExtractText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

            addLog(req.user.username, req.user.role, '解析并提取视频', url);
            res.json({
                success: true,
                videoUrl: videoSrc,
                targetUrl: url,
                title: title,
                cover: cover,
                platform: platform,
                description: rawExtractText || '暂无详细描述文案'
            });
        } else {
            res.status(404).json({ error: '嗅探失败，未能从该页面提取到视频流' });
        }
    } catch (error) {
        if (browser) await browser.close();
        console.error("解析报错:", error);
        res.status(500).json({ error: '解析引擎发生内部错误: ' + error.message });
    }
});

// ⚡ 异步文案提取与 AI 总结服务 (支持自定义 ASR Endpoint 以适配国内及阿里云部署)
app.post('/api/summarize', authenticate, async (req, res) => {
    const { videoUrl, targetUrl, title, platform, apiKey, endpointId, asrApiKey, asrEndpoint, asrModel } = req.body;
    if (!videoUrl) return res.status(400).json({ error: '请提供视频流物理地址' });

    // 校验频率限制 (仅普通用户，此时不增加计数，因为解析阶段已经扣减过了)
    const limitCheck = checkAndIncrementLimit(req.user, false);
    if (!limitCheck.allowed) {
        return res.status(403).json({ error: 'LIMIT_EXCEEDED', message: limitCheck.message });
    }

    addLog(req.user.username, req.user.role, '提取文案与AI总结', targetUrl || videoUrl);

    console.log(`[ASR & AI 总结] 收到异步处理请求。平台: ${platform || '未知'}, 视频地址 (截断): ${videoUrl.substring(0, 80)}...`);

    const tempFilePath = path.join(__dirname, `temp_transcribe_${Date.now()}.mp4`);
    let transcriptText = '';

    try {
        // 1. 设置下载防盗链 Header (与代理下载一致)
        let downloadHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        };
        const urlStr = videoUrl.toLowerCase();
        const refStr = targetUrl ? targetUrl.toLowerCase() : '';
        const isBili = urlStr.includes('bilibili.com') || urlStr.includes('bilivideo.com') || urlStr.includes('hdslb.com') || refStr.includes('bilibili.com') || refStr.includes('b23.tv');
        const isDouyin = urlStr.includes('douyin.com') || urlStr.includes('iesdouyin.com') || urlStr.includes('douyinvod.com') || urlStr.includes('snssdk.com') || refStr.includes('douyin.com') || refStr.includes('iesdouyin.com');
        const isXhs = urlStr.includes('xiaohongshu.com') || urlStr.includes('xhscdn.com') || refStr.includes('xiaohongshu.com') || refStr.includes('xhslink.com');

        if (isBili) {
            downloadHeaders['Referer'] = 'https://www.bilibili.com';
        } else if (isDouyin) {
            downloadHeaders['User-Agent'] = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';
        } else if (isXhs) {
            downloadHeaders['Referer'] = 'https://www.xiaohongshu.com';
        }

        // 2. 将视频下载到本地临时文件
        let targetDownloadUrl = videoUrl;
        if (platform === '抖音' || platform === 'douyin' || videoUrl.includes('douyinvod.com') || videoUrl.includes('snssdk.com')) {
            targetDownloadUrl = videoUrl.replace('ratio=1080p', 'ratio=720p');
            console.log(`[ASR & AI 总结] 检测到抖音视频，自动将 ASR 下载流画质降低为 720p 以突破 CDN 限速。新地址: ${targetDownloadUrl}`);
        }

        console.log(`[ASR & AI 总结] 正在下载视频到临时文件: ${tempFilePath}`);
        const writer = fs.createWriteStream(tempFilePath);
        const downloadRes = await axios({
            method: 'GET',
            url: targetDownloadUrl,
            responseType: 'stream',
            headers: downloadHeaders,
            timeout: 60000 // 60s timeout
        });

        await pipeline(downloadRes.data, writer);
        console.log(`[ASR & AI 总结] 视频下载完成，文件大小: ${fs.statSync(tempFilePath).size} 字节`);

        // 3. 调用 ASR 语音识别 (OpenAI Whisper 格式)
        const effectiveAsrKey = asrApiKey || '';
        const effectiveAsrUrl = asrEndpoint || 'https://api.openai.com/v1';
        const effectiveAsrModel = asrModel || 'whisper-1';

        if (effectiveAsrKey) {
            console.log(`[ASR & AI 总结] 正在调用 ASR 语音转文字... (节点: ${effectiveAsrUrl}, 模型: ${effectiveAsrModel})`);
            const formData = new FormData();
            formData.append('file', fs.createReadStream(tempFilePath));
            formData.append('model', effectiveAsrModel);
            formData.append('language', 'zh');

            const whisperRes = await axios.post(`${effectiveAsrUrl.replace(/\/$/, '')}/audio/transcriptions`, formData, {
                headers: {
                    ...formData.getHeaders(),
                    'Authorization': `Bearer ${effectiveAsrKey}`
                },
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
                timeout: 120000 // 2 minutes timeout for transcription
            });

            transcriptText = whisperRes.data.text || '';
            console.log(`[ASR & AI 总结] ASR 识别成功，识别到 ${transcriptText.length} 字。`);
        } else {
            console.log(`[ASR & AI 总结] 未配置 ASR Key，跳过语音识别转写步骤`);
        }

    } catch (err) {
        console.error(`[ASR & AI 总结] ASR 转写流程失败:`, err.message);
        if (err.response) {
            try {
                const errBody = err.response.data;
                console.error(`[ASR 错误详情]`, errBody.toString ? errBody.toString() : errBody);
            } catch (e) {}
        }
    } finally {
        // 4. 清理本地临时文件
        if (fs.existsSync(tempFilePath)) {
            try {
                fs.unlinkSync(tempFilePath);
                console.log(`[ASR & AI 总结] 已清理临时视频文件`);
            } catch (unlinkErr) {
                console.error(`[ASR & AI 总结] 清理临时文件失败:`, unlinkErr.message);
            }
        }
    }

    // 5. 组装提炼文案并调用 LLM 大模型进行总结
    // 如果转写失败或未开启，则降级为使用原始视频描述
    const rawExtractText = (transcriptText || req.body.description || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    let aiSummary = null;

    // 解析使用的 LLM 引擎
    const provider = req.body.summaryProvider || (apiKey && !apiKey.includes('xxxxx') ? 'doubao' : 'siliconflow');
    let llmUrl = '';
    let llmKey = '';
    let modelName = '';
    let useJsonFormat = false;

    if (provider === 'doubao') {
        llmUrl = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
        llmKey = apiKey || '';
        modelName = endpointId || '';
        useJsonFormat = true;
    } else {
        // 硅基流动或其它 OpenAI 兼容节点
        const baseEndpoint = asrEndpoint || 'https://api.siliconflow.cn/v1';
        llmUrl = `${baseEndpoint.replace(/\/$/, '')}/chat/completions`;
        llmKey = asrApiKey || '';
        modelName = req.body.llmModel || 'Qwen/Qwen2.5-7B-Instruct';
    }

    if (llmKey && modelName && rawExtractText) {
        try {
            console.log(`[LLM AI] 正在调用大模型进行核心要点提炼... (引擎: ${provider}, 接入点/模型: ${modelName})`);
            const systemPrompt = `你是一个视频内容金牌提炼与总结大师。请根据我提供的视频标题、文案内容/字幕文本，完成以下任务，并以JSON格式返回。
        
任务：
1. 分析视频所属的核心行业分类(category)。
2. 精炼出3个深入、有高度价值 of 视频核心看点(points)。
3. 提供一条具有前瞻性和极强操作性的智能建议(suggestion)。

注意：请仅返回一个合法的 JSON 对象，不要包含 markdown 格式标记(如 \`\`\`json)，属性名必须为: "category", "points", "suggestion"。整个JSON需要能够通过JSON.parse完美解析。`;

            const userPrompt = `视频标题: ${title}
视频原始描述/字幕: ${rawExtractText.substring(0, 3000)} // 截取前3000字防 token 超限
视频所属平台: ${platform || '未知平台'}`;

            const postData = {
                model: modelName,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ]
            };

            if (useJsonFormat) {
                postData.response_format = { type: "json_object" };
            }

            const llmRes = await axios.post(llmUrl, postData, {
                headers: {
                    'Authorization': `Bearer ${llmKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });

            let reply = llmRes.data?.choices?.[0]?.message?.content;
            if (reply) {
                reply = reply.trim();
                // 稳健匹配：如果大模型返回了 markdown json 代码块，通过正则剥离出来
                const markdownJsonMatch = reply.match(/```json\s*([\s\S]*?)\s*```/) || reply.match(/```\s*([\s\S]*?)\s*```/);
                if (markdownJsonMatch) {
                    reply = markdownJsonMatch[1].trim();
                }
                
                const parsedReply = JSON.parse(reply);
                if (parsedReply.category && parsedReply.points && parsedReply.suggestion) {
                    aiSummary = {
                        category: parsedReply.category,
                        points: Array.isArray(parsedReply.points) ? parsedReply.points : [parsedReply.points],
                        suggestion: parsedReply.suggestion,
                        isRealAI: true
                    };
                    console.log(`[LLM AI] 深度视频要点提炼成功！`);
                }
            }
        } catch (e) {
            console.error(`[LLM AI] 接口调用错误，安全降级为本地启发式引擎:`, e.message);
        }
    }

    // 兜底本地启发式总结
    if (!aiSummary) {
        aiSummary = generateAISummary(title, rawExtractText, platform || '通用网页');
        aiSummary.isRealAI = false;
    }

    res.json({
        success: true,
        transcript: transcriptText || '未获取到视频的语音字幕文本。',
        aiSummary: aiSummary
    });
});

// 核心代理技术：无视大厂防盗链，直接流式透传下载给前端
app.get('/api/download', authenticate, async (req, res) => {
    const { videoUrl, referer, title, accessKey } = req.query;
    if (!videoUrl) return res.status(400).send('缺少视频地址');

    // 校验频率限制 (仅普通用户，此时不增加计数，因为解析阶段已经扣减过了)
    const limitCheck = checkAndIncrementLimit(req.user, false);
    if (!limitCheck.allowed) {
        return res.status(403).send('下载失败：' + limitCheck.message);
    }

    addLog(req.user.username, req.user.role, '下载物理视频', referer || videoUrl);

    // 🔑 外网下载密钥校验（仅针对 YouTube, TikTok 等海外平台）
    const isOverseas = videoUrl.includes('googlevideo.com') || videoUrl.includes('tiktok.com') || 
                      (referer && (referer.includes('youtube.com') || referer.includes('youtu.be') || referer.includes('tiktok.com')));
    if (isOverseas) {
        const expectedKey = process.env.ACCESS_KEY || '1qaz789';
        if (!accessKey || accessKey !== expectedKey) {
            console.log(`[下载验证] 未提供密钥或密钥错误。用户输入: "${accessKey || ''}"`);
            return res.status(403).send('下载海外平台视频需要正确的外网访问密钥！');
        }
        console.log(`[下载验证] 校验通过，允许下载海外视频流`);
    }

    try {
        // 1. Determine platform and apply custom headers to bypass hotlinking protection
        let downloadHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        };

        const urlStr = videoUrl.toLowerCase();
        const refStr = referer ? referer.toLowerCase() : '';

        const isBili = urlStr.includes('bilibili.com') || urlStr.includes('bilivideo.com') || urlStr.includes('hdslb.com') || refStr.includes('bilibili.com') || refStr.includes('b23.tv');
        const isDouyin = urlStr.includes('douyin.com') || urlStr.includes('iesdouyin.com') || urlStr.includes('douyinvod.com') || urlStr.includes('snssdk.com') || refStr.includes('douyin.com') || refStr.includes('iesdouyin.com');
        const isXhs = urlStr.includes('xiaohongshu.com') || urlStr.includes('xhscdn.com') || refStr.includes('xiaohongshu.com') || refStr.includes('xhslink.com');
        const isYT = urlStr.includes('googlevideo.com') || urlStr.includes('youtube.com') || urlStr.includes('youtu.be') || refStr.includes('youtube.com') || refStr.includes('youtu.be');
        const isTT = urlStr.includes('tiktok.com') || urlStr.includes('tiktokcdn.com') || refStr.includes('tiktok.com');

        if (isBili) {
            downloadHeaders['Referer'] = 'https://www.bilibili.com';
            downloadHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        } else if (isDouyin) {
            downloadHeaders['User-Agent'] = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';
            // Do not provide Referer header (must be empty/removed for Douyin CDN)
        } else if (isXhs) {
            downloadHeaders['Referer'] = 'https://www.xiaohongshu.com';
            downloadHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        } else if (isYT) {
            downloadHeaders['Referer'] = 'https://www.youtube.com';
            downloadHeaders['User-Agent'] = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';
        } else if (isTT) {
            downloadHeaders['Referer'] = 'https://www.tiktok.com';
            downloadHeaders['User-Agent'] = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';
        } else {
            // General Fallback
            if (referer) {
                downloadHeaders['Referer'] = referer;
            }
        }

        // 使用后端发起请求，彻底绕过前端浏览器的 CORS 限制
        const response = await axios({
            method: 'GET',
            url: videoUrl,
            responseType: 'stream',
            headers: downloadHeaders
        });

        // 拦截非视频流数据（例如被风控重定向到滑动验证 HTML 页面）
        const contentType = response.headers['content-type'] || '';
        if (contentType.includes('text/html') || contentType.includes('application/json')) {
            console.error(`[下载校验拦截] 拦截到非视频流响应 (ContentType: ${contentType})`);
            return res.status(403).send('下载失败：检测到平台安全验证风控页面，请返回重试或刷新页面。');
        }

        // 将视频流直接 pipe 转发给前端用户
        res.setHeader('Content-Type', 'video/mp4');

        // 过滤文件名中的非法字符，并支持中文 UTF-8 编码
        let safeTitle = (title || `VidFetch_Video_${Date.now()}`)
            .replace(/[\\/:*?"<>|]/g, '_') // 去除 Windows 文件名非法字符
            .trim();

        const encodedTitle = encodeURIComponent(safeTitle);
        res.setHeader('Content-Disposition', `attachment; filename="${encodedTitle}.mp4"; filename*=UTF-8''${encodedTitle}.mp4`);
        response.data.pipe(res);

    } catch (error) {
        console.error("代理下载失败:", error.message);
        res.status(500).send('流媒体拉取失败，防盗链拒绝连接。');
    }
});

// 静态文件服务：托管 Vue 编译后的前端静态资产 (用于生产环境单端口部署)
app.use(express.static(path.join(__dirname, 'frontend/dist')));

// 针对 SPA 路由的兜底处理：所有非 API 请求均返回 index.html
app.get('*all', (req, res, next) => {
    if (req.path.startsWith('/api')) {
        return next();
    }
    res.sendFile(path.join(__dirname, 'frontend/dist/index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🔥 VidFetch 极客本地/生产引擎已启动！`);
    console.log(`   引擎接口运行于: http://localhost:${PORT}`);
});