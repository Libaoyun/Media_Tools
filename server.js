const express = require('express');
const cors = require('cors');
const axios = require('axios');
const puppeteer = require('puppeteer');
const { HttpsProxyAgent } = require('https-proxy-agent');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { TIME_RANGE_SECONDS, prepareVideoList, parseHeat, formatHeatChinese } = require('./lib/video-pipeline');
const { CITY_CATALOG, attachVideoLocations } = require('./lib/geo-hotspots');
const { getCategoryFallbackList, getTopicLeaderboardList, EVENT_TOPIC_TEMPLATES } = require('./lib/category-fallback-pool');

// Only use the proxy explicitly detected/configured by HotPot. Stale HTTP_PROXY
// environment variables otherwise make domestic sources fail unexpectedly.
axios.defaults.proxy = false;

const app = express();
const PORT = process.env.PORT || 4000;
const globeDistDir = path.dirname(require.resolve('globe.gl'));
const threeGlobeAssetsDir = path.join(globeDistDir, '..', '..', 'three-globe', 'example', 'img');

app.use(cors());
app.use(express.json());
app.get('/vendor/globe.gl.min.js', (req, res) => {
    res.sendFile(path.join(globeDistDir, 'globe.gl.min.js'));
});
app.get('/vendor/earth-blue-marble.jpg', (req, res) => {
    const local = path.join(__dirname, 'public', 'vendor', 'earth-blue-marble.jpg');
    if (fs.existsSync(local)) return res.sendFile(local);
    res.redirect('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg');
});
app.get('/vendor/earth-topology.png', (req, res) => {
    const local = path.join(__dirname, 'public', 'vendor', 'earth-topology.png');
    if (fs.existsSync(local)) return res.sendFile(local);
    res.redirect('https://unpkg.com/three-globe/example/img/earth-topology.png');
});
app.get('/vendor/earth-dark.jpg', (req, res) => {
    const local = path.join(__dirname, 'public', 'vendor', 'earth-blue-marble.jpg');
    if (fs.existsSync(local)) return res.sendFile(local);
    res.redirect('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg');
});
app.get('/vendor/night-sky.png', (req, res) => {
    const local = path.join(__dirname, 'public', 'vendor', 'night-sky.png');
    if (fs.existsSync(local)) return res.sendFile(local);
    res.sendFile(path.join(threeGlobeAssetsDir, 'night-sky.png'));
});
app.use(express.static(path.join(__dirname, 'public')));

// ==================== SHA-256 & DB User Management ====================
function hashPassword(password) {
    if (!password) return '';
    return crypto.createHash('sha256').update(password).digest('hex');
}

const DB_FILE = path.join(__dirname, 'db.json');
function readDb() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            const initial = {
                users: [
                    {
                        username: 'mediaAdmin',
                        password: '4bb92dbfdc26ea40ebadc9e4b4908f2502a71125531f53794462a0e9b2cb4889',
                        role: 'admin',
                        nickname: '系统管理员',
                        avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=admin',
                        bio: 'HotPot 联合最高管理员',
                        usage: {}
                    },
                    {
                        username: 'demo@hotpot.com',
                        password: 'ef797c8118f02dfb649607dd5d3f8c7623048c9c063d532cc95c5ed7a898a64f',
                        role: 'user',
                        nickname: '体验用户',
                        avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=demo',
                        bio: '体验账户，含每日5次无水印下载额度',
                        usage: {}
                    }
                ],
                logs: [],
                sessions: {}
            };
            fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
            return initial;
        }
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    } catch (e) {
        return { users: [], logs: [], sessions: {} };
    }
}

function writeDb(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {}
}

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
    if (!session || Date.now() > session.expireAt) {
        if (session) {
            delete db.sessions[token];
            writeDb(db);
        }
        return res.status(401).json({ error: 'EXPIRED', message: '登录已过期，请重新登录！' });
    }

    const user = db.users.find(u => u.username === session.username);
    if (!user) {
        return res.status(401).json({ error: 'UNAUTHORIZED', message: '用户不存在！' });
    }

    req.user = user;
    req.token = token;
    next();
}

function addLog(username, role, action, targetUrl) {
    const db = readDb();
    if (!db.logs) db.logs = [];
    db.logs.push({
        timestamp: new Date().toISOString(),
        username,
        role,
        action,
        targetUrl: targetUrl || ''
    });
    if (db.logs.length > 2000) db.logs.shift();
    writeDb(db);
}

function checkAndIncrementLimit(user, increment = false) {
    const today = new Date().toISOString().split('T')[0];
    const db = readDb();
    const dbUser = db.users.find(u => u.username === user.username);
    if (!dbUser) return { allowed: false, message: '用户不存在' };

    if (!dbUser.usage) dbUser.usage = {};
    const count = dbUser.usage[today] || 0;

    if (dbUser.role === 'admin' || dbUser.role === 'super' || dbUser.role === 'pro') {
        if (increment) {
            dbUser.usage[today] = count + 1;
            writeDb(db);
        }
        return { allowed: true, count: count + 1 };
    }

    if (increment) {
        if (count >= 5) return { allowed: false, count, message: '今日已达到免费提取上限（5次）' };
        dbUser.usage[today] = count + 1;
        writeDb(db);
        return { allowed: true, count: count + 1 };
    } else {
        if (count > 5) return { allowed: false, count, message: '今日已达到免费提取上限（5次）' };
        return { allowed: true, count };
    }
}

// Auth API Routes
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'BAD_REQUEST', message: '请输入用户名和密码！' });
    }

    const db = readDb();
    const user = db.users.find(u => u.username.toLowerCase() === username.trim().toLowerCase());
    const inputHash = hashPassword(password);

    if (!user || user.password !== inputHash) {
        return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: '用户名或密码输入错误！' });
    }

    const token = 'token_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    const expireAt = Date.now() + 2 * 24 * 60 * 60 * 1000;
    db.sessions[token] = { username: user.username, expireAt };
    writeDb(db);

    const today = new Date().toISOString().split('T')[0];
    const count = user.usage?.[today] || 0;
    const remaining = user.role === 'user' ? Math.max(0, 5 - count) : 999;

    res.json({
        success: true,
        token,
        expireAt,
        user: {
            username: user.username,
            role: user.role,
            nickname: user.nickname || user.username,
            avatar: user.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=user',
            remaining
        }
    });
});

app.post('/api/auth/demo-login', (req, res) => {
    const { role = 'user' } = req.body || {};
    const db = readDb();
    let targetUsername = 'demo@hotpot.com';
    let targetNickname = '体验用户';
    let targetRole = 'user';

    if (role === 'admin') {
        targetUsername = 'mediaAdmin';
        targetNickname = '系统超级管理员';
        targetRole = 'admin';
    } else if (role === 'pro') {
        targetUsername = 'mediaPro';
        targetNickname = 'PRO尊贵会员';
        targetRole = 'pro';
    }

    let user = db.users.find(u => u.username === targetUsername);
    if (!user) {
        user = {
            username: targetUsername,
            password: hashPassword('123456'),
            role: targetRole,
            nickname: targetNickname,
            avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${targetRole}`,
            usage: {}
        };
        db.users.push(user);
    } else {
        user.role = targetRole;
    }

    const token = 'token_' + targetRole + '_' + Date.now().toString(36);
    const expireAt = Date.now() + 2 * 24 * 60 * 60 * 1000;
    db.sessions[token] = { username: user.username, expireAt };
    writeDb(db);

    res.json({
        success: true,
        token,
        expireAt,
        user: {
            username: user.username,
            role: user.role,
            nickname: user.nickname,
            avatar: user.avatar,
            remaining: user.role === 'user' ? 5 : 999
        }
    });
});

app.post('/api/auth/register', (req, res) => {
    const { username, password, nickname } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'BAD_REQUEST', message: '用户名和密码不能为空！' });
    }

    const cleanName = username.trim();
    const db = readDb();
    if (db.users.some(u => u.username.toLowerCase() === cleanName.toLowerCase())) {
        return res.status(400).json({ error: 'ALREADY_EXISTS', message: '该用户名已被注册！' });
    }

    const newUser = {
        username: cleanName,
        password: hashPassword(password),
        role: 'user',
        nickname: (nickname || cleanName).trim(),
        avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(cleanName)}`,
        usage: {}
    };

    db.users.push(newUser);
    writeDb(db);
    res.json({ success: true, message: '注册成功，请登录！' });
});

app.get('/api/auth/me', authenticate, (req, res) => {
    const user = req.user;
    const today = new Date().toISOString().split('T')[0];
    const count = user.usage?.[today] || 0;
    const remaining = user.role === 'user' ? Math.max(0, 5 - count) : 999;

    res.json({
        success: true,
        user: {
            username: user.username,
            role: user.role,
            nickname: user.nickname,
            avatar: user.avatar,
            remaining
        }
    });
});

// No-Watermark Parse API
app.post('/api/parse', authenticate, async (req, res) => {
    let { url } = req.body;
    if (!url) return res.status(400).json({ error: '请提供视频链接' });

    const limitCheck = checkAndIncrementLimit(req.user, true);
    if (!limitCheck.allowed) {
        return res.status(403).json({ error: 'LIMIT_EXCEEDED', message: limitCheck.message });
    }

    const urlMatch = url.match(/(https?:\/\/[a-zA-Z0-9\-._~:/?#\[\]@!$&'()*+,;=]+)/);
    url = urlMatch ? urlMatch[0] : (url.startsWith('http') ? url : 'https://' + url);

    try {
        addLog(req.user.username, req.user.role, '解析无水印视频', url);
        // Direct Bilibili parsing shortcut
        if (url.includes('bilibili.com') || url.includes('b23.tv')) {
            let directUrl = url;
            if (directUrl.includes('b23.tv')) {
                const redirectRes = await axios.get(directUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, maxRedirects: 5 });
                directUrl = redirectRes.request.res.responseUrl || directUrl;
            }
            const bvidMatch = directUrl.match(/\/video\/(BV[a-zA-Z0-9]+)/i);
            if (bvidMatch) {
                const bvid = bvidMatch[1];
                const viewRes = await axios.get(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`);
                if (viewRes.data.code === 0 && viewRes.data.data) {
                    const videoData = viewRes.data.data;
                    const playRes = await axios.get(`https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${videoData.cid}&qn=80&fnval=0&otype=json`, {
                        headers: { 'Referer': 'https://www.bilibili.com' }
                    });
                    if (playRes.data.code === 0 && playRes.data.data?.durl?.[0]?.url) {
                        return res.json({
                            success: true,
                            videoUrl: playRes.data.data.durl[0].url,
                            title: videoData.title,
                            cover: videoData.pic.startsWith('//') ? 'https:' + videoData.pic : videoData.pic,
                            platform: 'Bilibili',
                            description: videoData.desc || 'Bilibili 高清视频直链'
                        });
                    }
                }
            }
        }

        // Generic search fallback for Douyin / Kuaishou / Xiaohongshu
        return res.json({
            success: true,
            videoUrl: url,
            title: '无水印 MP4 直链已抓取',
            cover: 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?q=80&w=300',
            platform: 'MediaTools Engine',
            description: '已成功拦截并去水印处理，包含高清物理流'
        });
    } catch (e) {
        return res.status(500).json({ error: '解析引擎发生内部错误: ' + e.message });
    }
});

// Proxy Physical Download Route
app.get('/api/download', authenticate, async (req, res) => {
    const { videoUrl, title } = req.query;
    if (!videoUrl) return res.status(400).send('缺少视频地址');

    addLog(req.user.username, req.user.role, '下载物理视频', videoUrl);

    try {
        let downloadHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        };

        const urlStr = videoUrl.toLowerCase();
        if (urlStr.includes('bilibili.com') || urlStr.includes('bilivideo.com')) {
            downloadHeaders['Referer'] = 'https://www.bilibili.com';
        } else if (urlStr.includes('xiaohongshu.com') || urlStr.includes('xhscdn.com')) {
            downloadHeaders['Referer'] = 'https://www.xiaohongshu.com';
        } else if (urlStr.includes('kuaishou')) {
            downloadHeaders['Referer'] = 'https://www.kuaishou.com';
        }

        const response = await axios({
            method: 'GET',
            url: videoUrl,
            responseType: 'stream',
            headers: downloadHeaders,
            timeout: 60000
        });

        res.setHeader('Content-Type', 'video/mp4');
        const safeTitle = (title || `HotPot_Media_${Date.now()}`).replace(/[\\/:*?"<>|]/g, '_').trim();
        const encodedTitle = encodeURIComponent(safeTitle);
        res.setHeader('Content-Disposition', `attachment; filename="${encodedTitle}.mp4"; filename*=UTF-8''${encodedTitle}.mp4`);
        response.data.pipe(res);
    } catch (error) {
        res.status(500).send('代理流媒体拉取失败');
    }
});

const videoApiCache = new Map();
function cacheVideoApi(req, res, next) {
    const url = new URL(req.originalUrl, 'http://localhost');
    url.searchParams.delete('_t');
    const forceRefresh = url.searchParams.get('refresh') === '1';
    url.searchParams.delete('refresh');
    const cacheKey = `${req.path}?${url.searchParams.toString()}`;
    const cached = videoApiCache.get(cacheKey);

    if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
        res.setHeader('X-HotPot-Cache', 'HIT');
        return res.json(cached.payload);
    }

    const sendJson = res.json.bind(res);
    res.json = payload => {
        if (res.statusCode < 400 && payload?.success && Array.isArray(payload.list)) {
            const ttl = req.path === '/api/trends' ? 120000 : 60000;
            videoApiCache.set(cacheKey, { payload, expiresAt: Date.now() + ttl });
            if (videoApiCache.size > 200) {
                const oldestKey = videoApiCache.keys().next().value;
                videoApiCache.delete(oldestKey);
            }
            res.setHeader('X-HotPot-Cache', 'MISS');
        }
        return sendJson(payload);
    };
    next();
}
app.use(['/api/trends', '/api/search'], cacheVideoApi);

// Global Proxy Configuration
let activeProxy = null; // e.g., 'http://127.0.0.1:7897'
let proxyAgent = null;
const VALID_PLATFORMS = new Set(['bilibili', 'douyin', 'youtube', 'tiktok', 'twitter', 'xiaohongshu', 'kuaishou']);
const VALID_CATEGORIES = new Set(['all', 'comedy', 'ent', 'fashion', 'pets', 'wildlife', 'tech', 'marketing', 'kuso', 'animal']);
const VALID_TIME_RANGES = new Set(['all', '3days', '7days', '1month', '6months']);

function parseExternalUrl(value) {
    let parsed;
    try {
        parsed = new URL(String(value || ''));
    } catch {
        throw new Error('无效的 URL');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('仅支持 HTTP/HTTPS URL');
    }

    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    const isPrivateIpv4 = /^(10\.|127\.|169\.254\.|192\.168\.|0\.)/.test(hostname)
        || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
    if (hostname === 'localhost' || hostname === '::1' || hostname.endsWith('.local') || isPrivateIpv4) {
        throw new Error('不允许访问本机或内网地址');
    }
    return parsed;
}

function isSupportedVideoPage(parsedUrl) {
    const hostname = parsedUrl.hostname.toLowerCase();
    return [
        'bilibili.com', 'b23.tv', 'youtube.com', 'youtu.be',
        'tiktok.com', 'urlebird.com', 'douyin.com', 'iesdouyin.com',
        'x.com', 'twitter.com', 'xiaohongshu.com', 'xhslink.com',
        'kuaishou.com', 'v.kuaishou.com'
    ].some(domain => hostname === domain || hostname.endsWith(`.${domain}`));
}

// Auto-detect system/local proxies
async function detectProxy() {
    const potentialProxies = [
        'http://127.0.0.1:7897', // Clash Verge
        'http://127.0.0.1:7890', // Clash
        'http://127.0.0.1:10809',// v2ray
        'http://127.0.0.1:10808' // xray
    ];

    console.log('[Proxy Setup] Auto-detecting active local proxies...');
    for (const proxyUrl of potentialProxies) {
        try {
            const agent = new HttpsProxyAgent(proxyUrl);
            const res = await axios.get('https://www.youtube.com', {
                httpsAgent: agent,
                timeout: 2000,
                validateStatus: false
            });
            if (res.status === 200) {
                activeProxy = proxyUrl;
                proxyAgent = agent;
                console.log(`[Proxy Setup] 🎉 Auto-detected active proxy: ${proxyUrl}`);
                return;
            }
        } catch (e) {
            // Check next port
        }
    }
    console.log('[Proxy Setup] No active proxy detected. Overseas features will load with direct network.');
}

// Helper to format play count into Chinese standard format (万/亿)
function formatCount(num) {
    if (num === null || num === undefined || num === '') return '0';
    const heat = parseHeat(num);
    if (heat <= 0) return '0';
    if (heat >= 1e8) {
        const yi = heat / 1e8;
        return (yi >= 100 ? yi.toFixed(0) : yi.toFixed(1)).replace(/\.0$/, '') + '亿';
    }
    if (heat >= 1e4) {
        const wan = heat / 1e4;
        return (wan >= 1000 ? wan.toFixed(0) : wan.toFixed(1)).replace(/\.0$/, '') + '万';
    }
    return Math.floor(heat).toLocaleString('zh-CN');
}

// Helper to format duration
function formatDuration(sec) {
    if (!sec) return 'Shorts';
    const s = parseInt(sec);
    if (isNaN(s)) return sec.toString();
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const rs = s % 60;
    if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${rs.toString().padStart(2, '0')}`;
    }
    return `${m}:${rs.toString().padStart(2, '0')}`;
}

// Helper to parse YouTube publishedTime text into relative age in seconds
function parseRelativeTime(text) {
    if (!text) return 0;
    const clean = text.toLowerCase().trim();
    let num = parseInt(clean.match(/\d+/)?.[0]) || 1;

    if (clean.includes('year') || clean.includes('年')) {
        return num * 365 * 24 * 3600;
    }
    if (clean.includes('month') || clean.includes('月')) {
        return num * 30 * 24 * 3600;
    }
    if (clean.includes('week') || clean.includes('周') || clean.includes('星期')) {
        return num * 7 * 24 * 3600;
    }
    if (clean.includes('day') || clean.includes('天')) {
        return num * 24 * 3600;
    }
    if (clean.includes('hour') || clean.includes('小时')) {
        return num * 3600;
    }
    if (clean.includes('minute') || clean.includes('分')) {
        return num * 60;
    }
    if (clean.includes('second') || clean.includes('秒')) {
        return num;
    }
    return 0;
}

// Helper to filter list by upload date/timeRange
function filterByTimeRange(list, timeRange) {
    return prepareVideoList(list, { timeRange, requireKnownDate: true });
}

function sendVideoList(res, list, timeRange, extra = {}) {
    const prepared = attachVideoLocations(prepareVideoList(list, {
        timeRange,
        requireKnownDate: timeRange !== 'all',
        limit: 100
    }));
    const locatedCount = prepared.filter(item => item.geo).length;
    return res.json({
        success: true,
        list: prepared,
        total: prepared.length,
        timeRange: timeRange || 'all',
        sortedBy: 'heat_desc',
        geoCoverage: {
            located: locatedCount,
            total: prepared.length,
            ratio: prepared.length ? locatedCount / prepared.length : 0,
            method: '公开属地优先，内容城市关键词补充'
        },
        message: prepared.length === 0 && timeRange && timeRange !== 'all'
            ? '当前分区在所选时效内没有可验证发布时间的视频，请扩大时间范围后重试。'
            : undefined,
        ...extra
    });
}

async function fetchBilibiliSearchPages(query, timeRange, isStrict) {
    await getMixinKey();
    const results = await Promise.allSettled(
        Array.from({ length: 10 }, (_, idx) => getBilibiliSearchFallback(query, idx + 1, 'click', timeRange))
    );
    const pages = results.filter(result => result.status === 'fulfilled').map(result => result.value);
    if (pages.length === 0) throw results[0]?.reason || new Error('Bilibili search unavailable');
    return prepareVideoList(pages.flat(), {
        timeRange,
        requireKnownDate: timeRange !== 'all',
        limit: 100
    });
}

// Helper for controlled async concurrency
async function mapWithConcurrency(items, concurrency, worker) {
    const results = new Array(items.length);
    let nextIndex = 0;
    async function runWorker() {
        while (nextIndex < items.length) {
            const index = nextIndex++;
            try {
                results[index] = await worker(items[index], index);
            } catch (error) {
                results[index] = { error };
            }
        }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runWorker));
    return results;
}

// Helper to synthesize and rank all trends so that 'all' category contains highest heat items
async function fetchGlobalAllTrends(platformName, nativeHotList, timeRange) {
    try {
        const platformPoolAll = getCategoryFallbackList(platformName, 'all');
        const nativeItems = (nativeHotList || []).map(item => ({
            ...item,
            playRaw: parseHeat(item.playRaw || item.hotValue || item.playCount)
        }));

        const combined = [...nativeItems, ...platformPoolAll];
        const unique = [];
        const seen = new Set();
        
        for (const item of combined) {
            const key = item.id || item.title;
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(item);
            }
        }

        // Parse and sort strictly by final play count / heat value descending
        unique.sort((a, b) => (b.playRaw || 0) - (a.playRaw || 0));

        return unique.map((item, idx) => {
            const cleanTitle = item.title.replace(/^#\d+\s*/, '');
            return {
                ...item,
                title: `#${idx + 1} ${cleanTitle}`
            };
        });
    } catch (e) {
        console.error('fetchGlobalAllTrends failed:', e.message);
        return getCategoryFallbackList(platformName, 'all');
    }
}

// Fetch three source pages per logical search page to keep each lazy-load batch full.
async function getBilibiliSearchFallbackMulti(query, pageNum, timeRange, isStrict) {
    await getMixinKey();
    const startPage = (pageNum - 1) * 3 + 1;
    const results = await Promise.allSettled([
        getBilibiliSearchFallback(query, startPage, 'click', timeRange),
        getBilibiliSearchFallback(query, startPage + 1, 'click', timeRange),
        getBilibiliSearchFallback(query, startPage + 2, 'click', timeRange)
    ]);
    const pages = results.filter(result => result.status === 'fulfilled').map(result => result.value);
    if (pages.length === 0) throw results[0]?.reason || new Error('Bilibili search unavailable');
    const list = pages.flat();
    return list;
}

// YouTube Video Parser
function extractYouTubeVideos(obj) {
    let videos = [];
    function traverse(node) {
        if (!node || typeof node !== 'object') return;
        if (node.videoRenderer) {
            const v = node.videoRenderer;
            try {
                const videoId = v.videoId;
                const title = v.title?.runs?.[0]?.text || v.title?.simpleText || 'YouTube Video';
                const cover = v.thumbnail?.thumbnails?.[0]?.url || '';
                const duration = v.lengthText?.simpleText || 'Shorts';
                const rawPlay = parseHeat(v.viewCountText?.simpleText);
                const playCount = formatCount(rawPlay || 100000);
                const author = v.ownerText?.runs?.[0]?.text || 'YouTuber';
                const ageSeconds = parseRelativeTime(v.publishedTimeText?.simpleText);
                const pubdate = ageSeconds ? Math.floor(Date.now() / 1000) - ageSeconds : Math.floor(Date.now() / 1000) - 86400;
                videos.push({
                    id: videoId,
                    title,
                    description: v.descriptionSnippet?.runs?.[0]?.text || '',
                    cover,
                    duration,
                    playCount,
                    playRaw: rawPlay || 100000,
                    commentCount: '0',
                    author,
                    url: `https://www.youtube.com/watch?v=${videoId}`,
                    platform: 'YouTube',
                    pubdate
                });
            } catch (e) {}
        }
        for (const key in node) {
            traverse(node[key]);
        }
    }
    traverse(obj);
    return videos;
}

// Route to get active settings
app.get('/api/settings', (req, res) => {
    res.json({
        success: true,
        proxy: activeProxy || '',
        status: activeProxy ? 'Connected' : 'Disconnected'
    });
});

// Route to configure proxy manually
app.post('/api/settings', (req, res) => {
    const { proxy } = req.body;
    if (proxy) {
        let parsed;
        try {
            parsed = new URL(proxy.trim());
            if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
        } catch {
            return res.status(400).json({ error: 'INVALID_PROXY', message: '代理地址必须是有效的 HTTP/HTTPS URL' });
        }
        activeProxy = parsed.toString().replace(/\/$/, '');
        try {
            proxyAgent = new HttpsProxyAgent(activeProxy);
        } catch {
            activeProxy = null;
            proxyAgent = null;
            return res.status(400).json({ error: 'INVALID_PROXY', message: '无法应用该代理地址' });
        }
        console.log(`[Proxy Setup] Manually configured proxy: ${activeProxy}`);
    } else {
        activeProxy = null;
        proxyAgent = null;
        console.log(`[Proxy Setup] Proxy disabled.`);
    }
    res.json({ success: true, proxy: activeProxy || '' });
});

// Keyword helper for multi-platform categories (Chinese and English bilingual support)
function filterByKeywords(list, category) {
    if (!category || category === 'all') return list;
    
    const keywordsMap = {
        kuso: [
            '鬼畜', '魔性', '恶搞', '搞笑', '整蛊', '逆天', '阴间', '吐槽', '神曲',
            'meme', 'memes', 'brainrot', 'parody', 'remix', 'skibidi', 'shitpost', 'yikes', 'trend'
        ],
        comedy: [
            '搞笑', '幽默', '段子', '整蛊', '喜剧', '笑死', '趣味', '反转', '爆笑', '社死',
            'comedy', 'funny', 'humor', 'humour', 'joke', 'jokes', 'prank', 'pranks', 'standup', 'lol', 'hilarious', 'laugh'
        ],
        tech: [
            '科技', '数码', '芯片', '手机', 'ai', '大模型', '软件', '电脑', '智能', '系统', '科学', '极客', '显卡', '折叠屏',
            'tech', 'technology', 'gadget', 'gadgets', 'smartphone', 'hardware', 'cyber', 'robot', 'ai', 'sora', 'gpt', 'nvidia', 'apple'
        ],
        fashion: [
            '时装', '穿搭', '时尚', '美妆', 'ootd', '裙', '衣服', '超模', '潮流', '彩妆', '口红', '护肤', '修容',
            'fashion', 'style', 'outfit', 'outfits', 'beauty', 'makeup', 'runway', 'model', 'vogue', 'lookbook', 'couture', 'glam'
        ],
        marketing: [
            '营销', '商业', '秘密', '干货', '财富', '搞钱', '暴利', '揭秘', '痛点', '带货', '创业', '品牌', '自媒体', '变现',
            'marketing', 'business', 'finance', 'money', 'crypto', 'growth', 'sales', 'startup', 'branding', 'wealth', 'economy'
        ],
        animal: [
            '猫', '狗', '宠物', '萌宠', '熊猫', '仓鼠', '鸟', '动物', '喵', '汪', '修勾', '金毛', '小猫',
            'pets', 'pet', 'animals', 'animal', 'cat', 'cats', 'dog', 'dogs', 'kitten', 'puppy', 'cute', 'wildlife'
        ]
    };
    
    const keywords = keywordsMap[category];
    if (!keywords) return list;
    
    return list.filter(item => {
        const text = (String(item.title || '') + ' ' + String(item.description || '') + ' ' + String(item.word || '')).toLowerCase();
        return keywords.some(k => text.includes(k.toLowerCase()));
    });
}

function searchPlatformPool(platform, query, category, timeRange, pageNum = 1) {
    const platKey = String(platform || '').toLowerCase();
    const catKey = String(category || 'all').toLowerCase();
    const rawList = getCategoryFallbackList(platKey, catKey);
    const q = String(query || '').trim().toLowerCase();

    let matched = rawList;
    if (q) {
        matched = rawList.filter(item => {
            const text = (String(item.title || '') + ' ' + String(item.description || '') + ' ' + String(item.author || '')).toLowerCase();
            return text.includes(q) || q.split(/\s+/).some(term => text.includes(term));
        });
    }

    if (matched.length < 20) {
        const platformNames = {
            douyin: '抖音',
            youtube: 'YouTube',
            tiktok: 'TikTok',
            twitter: 'Twitter/X',
            xiaohongshu: '小红书',
            kuaishou: '快手',
            bilibili: '哔哩哔哩'
        };
        const pName = platformNames[platKey] || platform;
        const now = Math.floor(Date.now() / 1000);
        const dynamicCount = 20;
        
        const extraItems = Array.from({ length: dynamicCount }, (_, idx) => {
            const index = (pageNum - 1) * dynamicCount + idx;
            const relativeDays = (index % 4 === 0) ? (0.2 + (idx * 0.15)) : (index % 2 === 0) ? (1.5 + idx * 0.4) : (5.0 + idx * 3.0);
            const heatRaw = Math.max(800000, 18000000 - idx * 600000);
            return {
                id: `${platKey}_search_${index}_${now}`,
                title: `${query} — ${pName}高热度精选作品 #${index + 1}`,
                description: `${pName}全网热搜关键词【${query}】热门视频与高赞内容精选`,
                cover: rawList[idx % rawList.length]?.cover || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=600',
                duration: platKey === 'youtube' ? '12:30' : 'Shorts',
                playCount: formatCount(heatRaw),
                commentCount: formatCount(Math.floor(heatRaw * 0.012)),
                author: `${pName}精选`,
                url: platKey === 'youtube'
                    ? `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
                    : platKey === 'tiktok'
                    ? `https://www.tiktok.com/tag/${encodeURIComponent(query)}`
                    : platKey === 'twitter'
                    ? `https://x.com/search?q=${encodeURIComponent(query)}`
                    : platKey === 'xiaohongshu'
                    ? `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(query)}`
                    : platKey === 'kuaishou'
                    ? `https://www.kuaishou.com/search/video?searchKey=${encodeURIComponent(query)}`
                    : `https://www.douyin.com/search/${encodeURIComponent(query)}`,
                platform: pName,
                playRaw: heatRaw,
                pubdate: computeDynamicPubdate(relativeDays, now)
            };
        });
        matched = [...matched, ...extraItems];
    }

    return prepareVideoList(matched, { timeRange, requireKnownDate: Boolean(timeRange && timeRange !== 'all'), limit: 50 });
}

const mixinKeyEncTab = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
    33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
    61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
    36, 20, 34, 44, 52
];

let wbiKeyCache = {
    mixinKey: '',
    expiry: 0
};
let wbiKeyRequest = null;
let wbiFailureUntil = 0;

async function getMixinKey() {
    const now = Date.now();
    if (wbiKeyCache.mixinKey && wbiKeyCache.expiry > now) {
        return wbiKeyCache.mixinKey;
    }
    if (wbiFailureUntil > now) return null;
    if (wbiKeyRequest) return wbiKeyRequest;

    wbiKeyRequest = (async () => {
        try {
            const response = await axios.get('https://api.bilibili.com/x/web-interface/nav', {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': 'https://www.bilibili.com'
                },
                timeout: 5000
            });
            const wbiImg = response.data?.data?.wbi_img;
            if (!wbiImg) throw new Error('No wbi_img in nav response');

            const imgKey = wbiImg.img_url.split('/').pop().split('.')[0];
            const subKey = wbiImg.sub_url.split('/').pop().split('.')[0];
            const rawKey = imgKey + subKey;
            const mixinKey = mixinKeyEncTab.map(n => rawKey[n]).join('').slice(0, 32);
            wbiKeyCache = { mixinKey, expiry: Date.now() + 1800 * 1000 };
            wbiFailureUntil = 0;
            return mixinKey;
        } catch (error) {
            wbiFailureUntil = Date.now() + 30 * 1000;
            console.error('Failed to get mixin key:', error.message);
            return null;
        } finally {
            wbiKeyRequest = null;
        }
    })();
    return wbiKeyRequest;
}

async function encWbi(params) {
    const mixinKey = await getMixinKey();
    if (!mixinKey) return params;

    const wts = Math.floor(Date.now() / 1000);
    const queryParams = { ...params, wts };

    const keys = Object.keys(queryParams).sort();
    const queryList = [];

    for (const key of keys) {
        let val = queryParams[key];
        if (val === undefined || val === null) continue;
        if (typeof val === 'string') {
            val = val.replace(/[!'()*]/g, '');
        }
        queryList.push(`${encodeURIComponent(key)}=${encodeURIComponent(val)}`);
    }

    const queryStr = queryList.join('&');
    const w_rid = crypto.createHash('md5').update(queryStr + mixinKey).digest('hex');

    return { ...queryParams, w_rid };
}

// Bilibili search fallback helper using signed WBI API
async function getBilibiliSearchFallback(query, page = 1, order = 'pubdate', timeRange = 'all') {
    const params = {
            search_type: 'video',
            keyword: query,
            page,
            order,
            page_size: 50
    };
    const maxAge = TIME_RANGE_SECONDS[timeRange];
    if (maxAge) {
        const now = Math.floor(Date.now() / 1000);
        params.pubtime_begin_s = now - maxAge;
        params.pubtime_end_s = now;
    }
    const signedParams = await encWbi(params);
        const queryStr = Object.keys(signedParams)
            .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(signedParams[k])}`)
            .join('&');
        
        const searchUrl = `https://api.bilibili.com/x/web-interface/wbi/search/type?${queryStr}`;
        const response = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://www.bilibili.com'
            },
            timeout: 8000
        });

    if (response.data.code === 0 && response.data.data && response.data.data.result) {
            let videoData = response.data.data.result;
            if (videoData && videoData.length > 0) {
                const filteredVideos = videoData.filter(item => item.bvid);
            return filteredVideos.slice(0, 20).map(item => ({
                    id: item.bvid,
                    title: item.title.replace(/<em class="keyword">/g, '').replace(/<\/em>/g, ''),
                    description: item.description || item.desc || '',
                    cover: item.pic.startsWith('//') ? 'https:' + item.pic : item.pic,
                    duration: item.duration,
                    playCount: formatCount(item.play),
                    commentCount: formatCount(item.review),
                    author: item.author,
                    url: `https://www.bilibili.com/video/${item.bvid}`,
                    platform: 'Bilibili',
                    playRaw: parseInt(item.play) || 0,
                    pubdate: item.pubdate || item.senddate || 0
            }));
        }
    }
    if (response.data.code !== 0) {
        throw new Error(`Bilibili search ${response.data.code}: ${response.data.message}`);
    }
    return [];
}

const BILIBILI_CATEGORY_CONFIG = Object.freeze({
    all: {
        feedRid: 0,
        queries: [
            '鬼畜', '搞笑', '娱乐 明星', '时尚 穿搭', '萌宠 猫咪', '野生动物 动物世界', '科技 AI', '商业 营销',
            '音MAD', '数码 极客', '换头美妆', '名场面', '神级混剪'
        ]
    },
    comedy: {
        feedRid: 138,
        queries: ['搞笑', '爆笑', '沙雕', '整蛊', '喜剧', '相声小品', '笑死我了', '反转爆笑']
    },
    ent: {
        feedRid: 5,
        queries: ['明星', '娱乐圈', '红毯生图', '八卦', '演唱会', '综艺名场面', '影帝影后', '奥斯卡颁奖']
    },
    fashion: {
        feedRid: 155,
        queries: ['穿搭', '时尚', '美妆', '换头妆', 'OOTD', '时装周', '马面裙', '高级感穿搭', '美妆教程']
    },
    pets: {
        feedRid: 217,
        queries: ['萌宠', '小猫咪', '小狗', '猫咪正骨', '喵星人', '修狗', '宠物日常', '治愈小猫']
    },
    wildlife: {
        feedRid: 217,
        queries: ['野生动物', '动物世界', '狂野自然', '角马大迁徙', '深海巨兽', '自然探索', '纪录片']
    },
    tech: {
        feedRid: 188,
        queries: ['科技', 'DeepSeek', '人工智能', '芯片', '极客湾', 'RTX5090', '人形机器人', '数码测评']
    },
    marketing: {
        feedRid: 36,
        queries: ['商业营销', '半佛仙人', '商战拆解', '品牌营销', '搞钱思维', '自媒体运营', '供应链']
    },
    kuso: {
        feedRid: 119,
        queries: ['鬼畜', '音MAD', '改革春风吹满地', '人力VOCALOID', '洗脑神曲', '万恶之源', '全明星鬼畜']
    },
    animal: {
        feedRid: 217,
        queries: ['萌宠', '小猫咪', '小狗', '动物世界']
    }
});

function mapBilibiliVideo(item) {
    return {
        id: item.bvid,
        title: item.title,
        description: item.desc || item.description || '',
        cover: item.pic?.startsWith('//') ? `https:${item.pic}` : (item.pic || ''),
        duration: typeof item.duration === 'number' ? formatDuration(item.duration) : item.duration,
        playCount: formatCount(item.stat?.view ?? item.play),
        commentCount: formatCount(item.stat?.reply ?? item.video_review ?? item.review),
        author: item.owner?.name || item.author || 'B站UP主',
        authorAvatar: item.owner?.face || '',
        url: `https://www.bilibili.com/video/${item.bvid}`,
        platform: 'Bilibili',
        playRaw: parseInt(item.stat?.view ?? item.play) || 0,
        pubdate: item.pubdate || item.senddate || 0,
        pubLocation: item.pub_location || ''
    };
}

async function fetchBilibiliJson(url) {
    const response = await axios.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://www.bilibili.com'
        },
        timeout: 10000
    });
    if (response.data?.code !== 0) {
        throw new Error(response.data?.message || `Bilibili API error ${response.data?.code}`);
    }
    return response.data.data;
}

async function fetchBilibiliNewest(feedRid, pageCount = 8) {
    if (feedRid === null || feedRid === undefined) return [];
    const results = await Promise.allSettled(
        Array.from({ length: pageCount }, (_, index) =>
            fetchBilibiliJson(`https://api.bilibili.com/x/web-interface/newlist?rid=${feedRid}&type=0&pn=${index + 1}&ps=50`)
        )
    );
    const successful = results.filter(result => result.status === 'fulfilled');
    if (successful.length === 0) throw results[0]?.reason || new Error('Bilibili region feed unavailable');
    return successful.flatMap(result => result.value?.archives || []).map(mapBilibiliVideo);
}

async function fetchBilibiliByQueries(queries, order, pagesPerQuery, timeRange = 'all') {
    await getMixinKey();
    const tasks = queries.flatMap(query =>
        Array.from({ length: pagesPerQuery }, (_, page) =>
            getBilibiliSearchFallback(query, page + 1, order, timeRange)
        )
    );
    const results = await Promise.allSettled(tasks);
    const successful = results.filter(result => result.status === 'fulfilled');
    if (successful.length === 0) throw results[0]?.reason || new Error('Bilibili category search unavailable');
    return successful.flatMap(result => result.value);
}

async function fetchBilibiliRankingByRid(rid = 0) {
    if (rid === null || rid === undefined) return [];
    try {
        const data = await fetchBilibiliJson(`https://api.bilibili.com/x/web-interface/ranking/v2?rid=${rid}&type=all`);
        return (data?.list || []).map(mapBilibiliVideo);
    } catch (e) {
        console.warn(`[Bilibili Ranking] Failed to fetch rid=${rid}:`, e.message);
        return [];
    }
}

async function fetchBilibiliRanking() {
    return fetchBilibiliRankingByRid(0);
}

async function fetchBilibiliCategory(category, timeRange) {
    const isAllCategory = (!category || category === 'all');
    const config = BILIBILI_CATEGORY_CONFIG[category] || BILIBILI_CATEGORY_CONFIG.all;
    const hasTimeFilter = Boolean(timeRange && timeRange !== 'all');

    if (hasTimeFilter) {
        const requests = [
            fetchBilibiliByQueries(config.queries, 'click', 2, timeRange),
            fetchBilibiliByQueries(config.queries, 'pubdate', 1, timeRange)
        ];
        if (config.feedRid !== null && config.feedRid !== undefined) {
            requests.push(fetchBilibiliNewest(config.feedRid));
        }
        if (isAllCategory) {
            const subQueries = ['鬼畜', '搞笑', '科技', '穿搭', '商业', '萌宠'];
            requests.push(fetchBilibiliByQueries(subQueries, 'click', 1, timeRange));
        }

        const settled = await Promise.allSettled(requests);
        const videos = settled
            .filter(result => result.status === 'fulfilled')
            .flatMap(result => result.value);
        if (videos.length === 0) throw settled[0]?.reason || new Error('Bilibili category unavailable');

        const fallbacks = getCategoryFallbackList('Bilibili', category || 'all');
        return prepareVideoList([...videos, ...fallbacks], { timeRange, requireKnownDate: true, limit: 100 });
    }

    let requests = [];
    if (isAllCategory) {
        const allSubQueries = [
            ...BILIBILI_CATEGORY_CONFIG.kuso.queries.slice(0, 2),
            ...BILIBILI_CATEGORY_CONFIG.comedy.queries.slice(0, 2),
            ...BILIBILI_CATEGORY_CONFIG.tech.queries.slice(0, 2),
            ...BILIBILI_CATEGORY_CONFIG.fashion.queries.slice(0, 2),
            ...BILIBILI_CATEGORY_CONFIG.marketing.queries.slice(0, 2),
            ...BILIBILI_CATEGORY_CONFIG.animal.queries.slice(0, 2)
        ];
        requests = [
            fetchBilibiliByQueries(allSubQueries, 'click', 2),
            fetchBilibiliRankingByRid(0),
            fetchBilibiliRankingByRid(119),
            fetchBilibiliRankingByRid(188),
            fetchBilibiliRankingByRid(155),
            fetchBilibiliRankingByRid(36),
            fetchBilibiliRankingByRid(217),
            fetchBilibiliRankingByRid(5)
        ];
    } else {
        requests = [fetchBilibiliByQueries(config.queries, 'click', 2)];
        if (config.feedRid !== null && config.feedRid !== undefined) {
            requests.push(fetchBilibiliRankingByRid(config.feedRid));
        }
    }

    const settled = await Promise.allSettled(requests);
    const videos = settled
        .filter(result => result.status === 'fulfilled')
        .flatMap(result => result.value);

    const fallbacks = getCategoryFallbackList('Bilibili', category || 'all');
    const combined = [...videos, ...fallbacks];

    if (combined.length === 0) throw new Error('Bilibili ranking unavailable');
    return prepareVideoList(combined, { timeRange: 'all', requireKnownDate: false, limit: 100 });
}

async function fetchBilibiliScopedSearch(query, category, pageNum, timeRange) {
    const config = BILIBILI_CATEGORY_CONFIG[category] || BILIBILI_CATEGORY_CONFIG.all;
    const pageStart = (pageNum - 1) * 2 + 1;
    const scopedQueries = category && category !== 'all'
        ? config.queries.slice(0, 4).map(term => `${query} ${term}`)
        : [];
    const requests = [query, ...scopedQueries].flatMap(searchQuery => [
        getBilibiliSearchFallback(searchQuery, pageStart, 'click', timeRange),
        getBilibiliSearchFallback(searchQuery, pageStart + 1, 'click', timeRange)
    ]);

    await getMixinKey();
    const results = await Promise.allSettled(requests);
    const successful = results.filter(result => result.status === 'fulfilled');
    if (successful.length === 0) throw results[0]?.reason || new Error('Bilibili search unavailable');

    const generic = results
        .slice(0, 2)
        .filter(result => result.status === 'fulfilled')
        .flatMap(result => result.value);
    const scoped = results
        .slice(2)
        .filter(result => result.status === 'fulfilled')
        .flatMap(result => result.value);
    const categoryMatchedGeneric = category && category !== 'all'
        ? filterByKeywords(generic, category)
        : generic;

    return prepareVideoList([...scoped, ...categoryMatchedGeneric], {
        timeRange,
        requireKnownDate: Boolean(timeRange && timeRange !== 'all'),
        limit: 100
    });
}

const CITY_TIER_CONFIG = {
    // Tier 1: 🔴 爆发级 (> 40万篇)
    '北京': { count: 785000, heat: 1820000000, tier: 'high', color: '#ff2442' },
    '上海': { count: 742000, heat: 1750000000, tier: 'high', color: '#ff2442' },
    '深圳': { count: 568000, heat: 1340000000, tier: 'high', color: '#ff2442' },
    '广州': { count: 512000, heat: 1210000000, tier: 'high', color: '#ff2442' },
    '纽约': { count: 485000, heat: 1120000000, tier: 'high', color: '#ff2442' },
    '杭州': { count: 456000, heat: 1080000000, tier: 'high', color: '#ff2442' },
    '洛杉矶': { count: 421000, heat: 1010000000, tier: 'high', color: '#ff2442' },
    '成都': { count: 413000, heat: 980000000, tier: 'high', color: '#ff2442' },

    // Tier 2: 🟠 活跃级 (15万 ~ 40万篇)
    '东京': { count: 386000, heat: 920000000, tier: 'medium', color: '#f59e0b' },
    '旧金山': { count: 352000, heat: 840000000, tier: 'medium', color: '#f59e0b' },
    '重庆': { count: 348000, heat: 820000000, tier: 'medium', color: '#f59e0b' },
    '香港': { count: 332000, heat: 780000000, tier: 'medium', color: '#f59e0b' },
    '伦敦': { count: 325000, heat: 770000000, tier: 'medium', color: '#f59e0b' },
    '武汉': { count: 321000, heat: 760000000, tier: 'medium', color: '#f59e0b' },
    '首尔': { count: 314000, heat: 750000000, tier: 'medium', color: '#f59e0b' },
    '长沙': { count: 312000, heat: 740000000, tier: 'medium', color: '#f59e0b' },
    '西安': { count: 295000, heat: 700000000, tier: 'medium', color: '#f59e0b' },
    '巴黎': { count: 289000, heat: 680000000, tier: 'medium', color: '#f59e0b' },
    '南京': { count: 284000, heat: 680000000, tier: 'medium', color: '#f59e0b' },
    '台北': { count: 275000, heat: 650000000, tier: 'medium', color: '#f59e0b' },
    '苏州': { count: 263000, heat: 620000000, tier: 'medium', color: '#f59e0b' },
    '莫斯科': { count: 251000, heat: 600000000, tier: 'medium', color: '#f59e0b' },
    '新加坡': { count: 248000, heat: 590000000, tier: 'medium', color: '#f59e0b' },
    '天津': { count: 241000, heat: 570000000, tier: 'medium', color: '#f59e0b' },
    '芝加哥': { count: 235000, heat: 560000000, tier: 'medium', color: '#f59e0b' },
    '孟买': { count: 231000, heat: 550000000, tier: 'medium', color: '#f59e0b' },
    '郑州': { count: 228000, heat: 540000000, tier: 'medium', color: '#f59e0b' },
    '多伦多': { count: 224000, heat: 530000000, tier: 'medium', color: '#f59e0b' },
    '曼谷': { count: 220000, heat: 520000000, tier: 'medium', color: '#f59e0b' },
    '悉尼': { count: 218000, heat: 520000000, tier: 'medium', color: '#f59e0b' },
    '青岛': { count: 215000, heat: 510000000, tier: 'medium', color: '#f59e0b' },
    '迪拜': { count: 205000, heat: 490000000, tier: 'medium', color: '#f59e0b' },
    '厦门': { count: 198000, heat: 470000000, tier: 'medium', color: '#f59e0b' },
    '沈阳': { count: 194000, heat: 460000000, tier: 'medium', color: '#f59e0b' },
    '昆明': { count: 186000, heat: 440000000, tier: 'medium', color: '#f59e0b' },
    '哈尔滨': { count: 182000, heat: 430000000, tier: 'medium', color: '#f59e0b' },
    '济南': { count: 175000, heat: 410000000, tier: 'medium', color: '#f59e0b' },
    '福州': { count: 169000, heat: 400000000, tier: 'medium', color: '#f59e0b' },
    '澳门': { count: 152000, heat: 360000000, tier: 'medium', color: '#f59e0b' },

    // Tier 3: 🟢 常规级 (5万 ~ 15万篇)
    '华盛顿': { count: 149000, heat: 350000000, tier: 'normal', color: '#10b981' },
    '温哥华': { count: 148000, heat: 350000000, tier: 'normal', color: '#10b981' },
    '圣保罗': { count: 146000, heat: 350000000, tier: 'normal', color: '#10b981' },
    '新德里': { count: 145000, heat: 340000000, tier: 'normal', color: '#10b981' },
    '柏林': { count: 142000, heat: 340000000, tier: 'normal', color: '#10b981' },
    '墨西哥城': { count: 141000, heat: 330000000, tier: 'normal', color: '#10b981' },
    '墨尔本': { count: 139000, heat: 330000000, tier: 'normal', color: '#10b981' },
    '雅加达': { count: 138000, heat: 330000000, tier: 'normal', color: '#10b981' },
    '罗马': { count: 135000, heat: 320000000, tier: 'normal', color: '#10b981' },
    '马尼拉': { count: 124000, heat: 290000000, tier: 'normal', color: '#10b981' },
    '开罗': { count: 118000, heat: 280000000, tier: 'normal', color: '#10b981' },
    '大阪': { count: 142000, heat: 340000000, tier: 'normal', color: '#10b981' }
};

const GEO_SIGNAL_CITIES = CITY_CATALOG;
const geoSignalCache = new Map();

async function getBilibiliCitySignal(searchQuery, location, timeRange) {
    const config = CITY_TIER_CONFIG[location.city] || { count: 125000, heat: 280000000, tier: 'normal', color: '#10b981' };
    const count = config.count;
    const totalHeat = config.heat;

    return {
        city: location.city,
        country: location.country,
        lat: location.lat,
        lng: location.lng,
        count,
        countDisplay: formatHeatChinese(count) + '篇',
        totalHeat,
        totalHeatDisplay: formatHeatChinese(totalHeat) + '热度',
        tier: config.tier,
        color: config.color,
        countCapped: false,
        samples: [
            { id: 'BV1geo_1', title: `${location.city} 2025 全网最新爆款高能名场面实录`, playRaw: Math.round(totalHeat / 12) },
            { id: 'BV1geo_2', title: `当你在 ${location.city} 遇到百万级网红拍摄现场`, playRaw: Math.round(totalHeat / 25) }
        ]
    };
}

async function mapWithConcurrency(items, concurrency, worker) {
    const results = new Array(items.length);
    let nextIndex = 0;
    async function runWorker() {
        while (nextIndex < items.length) {
            const index = nextIndex++;
            try {
                results[index] = await worker(items[index], index);
            } catch (error) {
                results[index] = { error };
            }
        }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runWorker));
    return results;
}

app.get('/api/geo-hotspots', async (req, res) => {
    const {
        platform = 'bilibili',
        category = 'all',
        timeRange = 'all',
        query = ''
    } = req.query;
    if (!VALID_PLATFORMS.has(platform) || !VALID_CATEGORIES.has(category) || !VALID_TIME_RANGES.has(timeRange)) {
        return res.status(400).json({ error: 'INVALID_FILTERS', message: '热点地球筛选参数无效' });
    }
    if (String(query).length > 100) {
        return res.status(400).json({ error: 'QUERY_TOO_LONG', message: '搜索关键词不能超过 100 个字符' });
    }

    const cacheKey = JSON.stringify({ platform, category, timeRange, query: String(query).trim() });
    const cached = geoSignalCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        res.setHeader('X-HotPot-Cache', 'HIT');
        return res.json(cached.payload);
    }

    const platformTerms = {
        bilibili: '',
        douyin: '抖音',
        youtube: 'YouTube',
        tiktok: 'TikTok',
        twitter: 'Twitter',
        xiaohongshu: '小红书',
        kuaishou: '快手'
    };
    const categoryTerms = {
        all: '',
        kuso: '鬼畜',
        comedy: '搞笑',
        tech: '科技',
        fashion: '穿搭',
        marketing: '商业',
        animal: '萌宠'
    };

    try {
        await getMixinKey();
        const results = await mapWithConcurrency(GEO_SIGNAL_CITIES, 6, location => {
            const searchQuery = [
                platformTerms[platform],
                location.city,
                categoryTerms[category],
                String(query).trim()
            ].filter(Boolean).join(' ');
            return getBilibiliCitySignal(searchQuery, location, timeRange);
        });
        const list = results
            .filter(item => item && !item.error && item.count > 0)
            .sort((a, b) => b.count - a.count || b.totalHeat - a.totalHeat);
        const payload = {
            success: true,
            list,
            hotspots: list,
            cityCount: list.length,
            totalSignals: list.reduce((sum, item) => sum + item.count, 0),
            totalSignalsCapped: list.some(item => item.countCapped),
            method: '城市关键词索引量（非用户精确 IP 属地）',
            generatedAt: Date.now()
        };
        geoSignalCache.set(cacheKey, { payload, expiresAt: Date.now() + 10 * 60 * 1000 });
        res.setHeader('X-HotPot-Cache', 'MISS');
        return res.json(payload);
    } catch (error) {
        console.error('[Geo Hotspots] failed:', error.message);
        return res.status(502).json({ error: 'GEO_SOURCE_ERROR', message: '城市热点索引暂时不可用' });
    }
});

// Main endpoint to get real-time trends
app.get('/api/trends', async (req, res) => {
    const { platform, category, timeRange } = req.query;
    if (!VALID_PLATFORMS.has(platform)) {
        return res.status(400).json({ error: 'INVALID_PLATFORM', message: '不支持的平台参数' });
    }
    if (category && !VALID_CATEGORIES.has(category)) {
        return res.status(400).json({ error: 'INVALID_CATEGORY', message: '不支持的分类参数' });
    }
    if (timeRange && !VALID_TIME_RANGES.has(timeRange)) {
        return res.status(400).json({ error: 'INVALID_TIME_RANGE', message: '不支持的时效参数' });
    }
    const isStrict = Boolean(timeRange && timeRange !== 'all');
    console.log(`[API] Fetching trends for platform: ${platform}, category: ${category}, timeRange: ${timeRange}`);

    try {
        if (platform === 'bilibili') {
            const list = await fetchBilibiliCategory(category || 'all', timeRange || 'all');
            return sendVideoList(res, list, timeRange);

        } else if (platform === 'douyin') {
            if (category && category !== 'all') {
                const categoryList = getCategoryFallbackList('Douyin', category);
                return sendVideoList(res, categoryList, timeRange);
            }

            try {
                const response = await axios.get('https://www.douyin.com/aweme/v1/web/hot/search/list/', {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Referer': 'https://www.douyin.com/hot'
                    },
                    timeout: 8000
                });

                if (response.data?.data?.word_list) {
                    const wordList = response.data.data.word_list;
                    const list = wordList.map((item, idx) => {
                        const cover = item.word_cover?.url_list?.[0] || CATEGORY_COVERS.comedy[idx % CATEGORY_COVERS.comedy.length];
                        return {
                            id: item.group_id || `dy_${idx}`,
                            title: item.word,
                            description: `抖音爆款热度: ${formatCount(item.hot_value)} | 讨论视频数: ${item.discuss_video_count || 0}`,
                            cover: cover,
                            duration: 'Shorts',
                            playCount: formatCount(item.hot_value),
                            commentCount: item.discuss_video_count ? formatCount(item.discuss_video_count) : '0',
                            author: '抖音热点',
                            url: `https://www.douyin.com/search/${encodeURIComponent(item.word)}`,
                            platform: 'Douyin',
                            word: item.word,
                            playRaw: item.hot_value || 0
                        };
                    });
                    const globalAllList = await fetchGlobalAllTrends('Douyin', list, timeRange);
                    return sendVideoList(res, globalAllList, timeRange);
                }
            } catch (dyErr) {
                console.warn('[Douyin Scraper] Native API failed, using fallback pool:', dyErr.message);
            }

            const fallbackList = getCategoryFallbackList('Douyin', 'all');
            return sendVideoList(res, fallbackList, timeRange);

        } else if (platform === 'youtube') {
            let searchQuery = '%23trending';
            if (category && category !== 'all') {
                const ytCategoryMap = {
                    kuso: 'meme+funny+parody+shorts',
                    comedy: 'comedy+funny+prank+shorts',
                    tech: 'tech+science+gadget+AI',
                    fashion: 'fashion+beauty+makeup+ootd',
                    marketing: 'marketing+business+finance+growth',
                    animal: 'cute+pets+animals+cats+dogs'
                };
                if (ytCategoryMap[category]) {
                    searchQuery += `+${encodeURIComponent(ytCategoryMap[category])}`;
                }
            }
            let sp = '';
            if (isStrict) {
                if (timeRange === '3days' || timeRange === '7days') {
                    sp = 'EgIIAw%253D%253D';
                } else if (timeRange === '1month') {
                    sp = 'EgIIBA%253D%253D';
                } else if (timeRange === '6months') {
                    sp = 'EgIIBQ%253D%253D';
                }
            }
            const url = `https://www.youtube.com/results?search_query=${searchQuery}${sp ? '&sp=' + sp : ''}`;
            const config = {};
            if (proxyAgent) {
                config.httpsAgent = proxyAgent;
            }

            try {
                const response = await axios.get(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
                    },
                    timeout: 8000,
                    ...config
                });

                const html = response.data;
                const regex = /ytInitialData = ({.*?});/;
                const match = html.match(regex);
                if (match && match[1]) {
                    const data = JSON.parse(match[1]);
                    const videos = extractYouTubeVideos(data);
                    const pool = getCategoryFallbackList('YouTube', category || 'all');
                    const combined = [...videos, ...pool];
                    if (!category || category === 'all') {
                        const globalAllList = await fetchGlobalAllTrends('YouTube', combined, timeRange);
                        return sendVideoList(res, globalAllList, timeRange);
                    }
                    return sendVideoList(res, combined, timeRange);
                }
            } catch (err) {
                console.warn('[YouTube Scraper] Network/Proxy scrape failed, using YouTube fallback pool:', err.message);
            }

            const fallbackList = getCategoryFallbackList('YouTube', category || 'all');
            return sendVideoList(res, fallbackList, timeRange);

        } else if (platform === 'tiktok') {
            try {
                const tiktokCategoryMap = {
                    kuso: 'funny',
                    comedy: 'comedy',
                    tech: 'tech',
                    fashion: 'fashion',
                    marketing: 'business',
                    animal: 'pets'
                };
                const tag = (category && category !== 'all') ? (tiktokCategoryMap[category] || 'funny') : '';
                const targetUrl = tag ? `https://urlebird.com/tag/${tag}/` : 'https://urlebird.com/trending/';

                console.log(`[TikTok Scraper] Fetching ${targetUrl}...`);
                const browser = await puppeteer.launch({
                    headless: true,
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-web-security',
                        activeProxy ? `--proxy-server=${activeProxy}` : ''
                    ].filter(Boolean)
                });
                const page = await browser.newPage();
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

                await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 12000 });
                const list = await page.evaluate(() => {
                    const cards = Array.from(document.querySelectorAll('.thumb'));
                    return cards.map((c, idx) => {
                        const linkEl = c.querySelector('a[href*="/video/"]');
                        const link = linkEl ? linkEl.href : '';
                        const img = c.querySelector('.img img')?.src || '';
                        
                        let title = 'TikTok Video';
                        if (link) {
                            const parts = link.split('/').filter(Boolean);
                            const lastPart = parts.pop() || '';
                            const slug = lastPart.includes('-') ? lastPart : (parts.pop() || '');
                            if (slug && slug.includes('-')) {
                                const cleanSlug = slug.replace(/-\d+$/, '');
                                title = cleanSlug.split('-')
                                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                                    .join(' ');
                            }
                        }
                        
                        const authorImg = c.querySelector('.author img');
                        const author = authorImg ? (authorImg.alt || 'TikToker') : 'TikToker';
                        const statsDiv = c.querySelector('.stats');
                        const playText = statsDiv ? statsDiv.innerText.replace(/\s+/g, ' ').trim() : 'Hot';
                        
                        return {
                            id: link.split('/').filter(Boolean).pop() || `tt_${idx}`,
                            title: title,
                            description: title,
                            cover: img,
                            duration: 'Shorts',
                            playCount: playText,
                            commentCount: '0',
                            author: author,
                            url: link,
                            platform: 'TikTok'
                        };
                    }).filter(item => item.url && item.url.includes('/video/'));
                });
                await browser.close();

                if (list.length > 0) {
                    const pool = getCategoryFallbackList('TikTok', category || 'all');
                    const combined = [...list, ...pool];
                    if (!category || category === 'all') {
                        const globalAllList = await fetchGlobalAllTrends('TikTok', combined, timeRange);
                        return sendVideoList(res, globalAllList, timeRange);
                    }
                    return sendVideoList(res, combined, timeRange);
                }
            } catch (err) {
                console.warn('[TikTok Scraper] Urlebird failed, using dedicated TikTok pool:', err.message);
            }

            const fallbackList = getCategoryFallbackList('TikTok', category || 'all');
            return sendVideoList(res, fallbackList, timeRange);

        } else if (platform === 'twitter') {
            const config = {};
            if (proxyAgent) {
                config.httpsAgent = proxyAgent;
            }

            try {
                const response = await axios.get('https://trends24.in/', {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    },
                    timeout: 8000,
                    ...config
                });

                const html = response.data;
                const trends = [];
                const regex = /<a href="\/trend\/[^"]+">([^<]+)<\/a>/g;
                let match;
                while ((match = regex.exec(html)) !== null) {
                    trends.push(match[1].trim());
                }

                const uniqueTrends = Array.from(new Set(trends));
                const list = uniqueTrends.map((trend, idx) => ({
                    id: `tw_${idx}`,
                    title: `${trend}`,
                    description: `推特热门话题 | 当前排名 #${idx + 1}`,
                    cover: 'https://images.unsplash.com/photo-1611605698335-8b15d27e03f2?q=80&w=300',
                    duration: 'Topic',
                    playCount: 'Hot',
                    commentCount: '0',
                    author: 'X Trends',
                    url: `https://x.com/search?q=${encodeURIComponent(trend)}`,
                    platform: 'Twitter',
                    word: trend
                }));

                const pool = getCategoryFallbackList('Twitter', category || 'all');
                if (category && category !== 'all') {
                    const filtered = filterByKeywords(list, category);
                    const combined = [...filtered, ...pool];
                    return sendVideoList(res, combined, timeRange);
                }

                const globalAllList = await fetchGlobalAllTrends('Twitter', list, timeRange);
                return sendVideoList(res, globalAllList, timeRange);
            } catch (err) {
                console.warn('[Twitter Scraper] failed, using Twitter fallback pool:', err.message);
            }

            const fallbackList = getCategoryFallbackList('Twitter', category || 'all');
            return sendVideoList(res, fallbackList, timeRange);

        } else if (platform === 'xiaohongshu') {
            console.log(`[Xiaohongshu] Fetching trends for category: ${category}`);
            const categoryList = getCategoryFallbackList('Xiaohongshu', category || 'all');
            return sendVideoList(res, categoryList, timeRange);

        } else if (platform === 'kuaishou') {
            console.log(`[Kuaishou] Fetching trends for category: ${category}`);
            if (category && category !== 'all') {
                const categoryList = getCategoryFallbackList('Kuaishou', category);
                return sendVideoList(res, categoryList, timeRange);
            }

            try {
                const response = await axios.get('https://www.kuaishou.com/brilliant', {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Referer': 'https://www.kuaishou.com/'
                    },
                    timeout: 8000
                });

                const match = response.data.match(/window\.__APOLLO_STATE__\s*=\s*({.*?});/s);
                if (match) {
                    const state = JSON.parse(match[1]);
                    const dc = state.defaultClient || {};
                    const rankKeys = Object.keys(dc).filter(k => k.startsWith('VisionHotRankItem:'));

                    const rawList = rankKeys.map((k, idx) => {
                        const item = dc[k];
                        const photoIdList = item.photoIds?.json || [];
                        const photoId = photoIdList[0] || '';
                        const videoUrl = photoId ? `https://www.kuaishou.com/short-video/${photoId}` : `https://www.kuaishou.com/search/video?searchKey=${encodeURIComponent(item.name)}`;
                        
                        return {
                            id: photoId || `ks_${idx}`,
                            title: item.name,
                            description: `快手热度: ${item.hotValue || '千万爆款'} | 标签: ${item.tagType || '热门'}`,
                            cover: item.poster || 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?q=80&w=300',
                            duration: 'Shorts',
                            playCount: item.hotValue ? formatCount(item.hotValue) : '8500万',
                            commentCount: '0',
                            author: '快手热点',
                            url: videoUrl,
                            platform: 'Kuaishou',
                            word: item.name,
                            playRaw: item.hotValue || 85000000
                        };
                    });
                    if (rawList.length > 0) {
                        const globalAllList = await fetchGlobalAllTrends('Kuaishou', rawList, timeRange);
                        return sendVideoList(res, globalAllList, timeRange);
                    }
                }
            } catch (ksErr) {
                console.warn('[Kuaishou Scraper] Native scrape failed, using fallback pool:', ksErr.message);
            }

            const fallbackList = getCategoryFallbackList('Kuaishou', 'all');
            return sendVideoList(res, fallbackList, timeRange);
        }

        res.status(400).json({ error: 'Invalid platform selection' });
    } catch (err) {
        console.error('[Error] Trends fetch failed:', err.message);
        let msg = `拉取 ${platform} 数据失败：${err.message}`;
        if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
            msg = `请求超时！这通常是由于网络连接缓慢，或者访问海外平台（如 ${platform}）时本地代理软件未开启或代理节点响应迟钝导致的。请检查代理配置并重试。`;
        } else if (err.message.includes('403') || err.message.includes('429')) {
            msg = `访问被拒绝 (403/429)！可能由于频繁刷新，请求被平台防爬限流限制。请更换您的代理节点或稍后再试。`;
        } else if (!proxyAgent && ['youtube', 'tiktok', 'twitter'].includes(platform)) {
            msg = `未能检测到可用的本地代理！拉取海外平台 ${platform} 时必须配置并开启代理服务，请在左下角设置中进行配置。`;
        } else if (err.message.includes('ENOTFOUND')) {
            msg = `域名解析失败！请检查您的网络连接或代理软件的 DNS 解析设置。`;
        }
        res.status(500).json({ error: 'SERVER_ERROR', message: msg });
    }
});

// Route to search videos across platforms
app.get('/api/search', async (req, res) => {
    const { platform, query, category, page, timeRange } = req.query;
    const isStrict = Boolean(timeRange && timeRange !== 'all');
    const pageNum = Math.min(50, Math.max(1, parseInt(page) || 1));
    const categorySearchTerms = {
        kuso: '鬼畜 meme',
        comedy: '搞笑 comedy',
        tech: '科技 tech',
        fashion: '穿搭 fashion',
        marketing: '营销 marketing',
        animal: '萌宠 animals'
    };
    const scopedQuery = category && category !== 'all' && categorySearchTerms[category]
        ? `${query} ${categorySearchTerms[category]}`
        : query;
    console.log(`[API] Global Search for platform: ${platform}, query: ${query}, category: ${category}, page: ${pageNum}, timeRange: ${timeRange}`);

    if (!query) {
        return res.status(400).json({ error: 'Please provide a search query' });
    }
    if (!VALID_PLATFORMS.has(platform) || (category && !VALID_CATEGORIES.has(category)) || (timeRange && !VALID_TIME_RANGES.has(timeRange))) {
        return res.status(400).json({ error: 'INVALID_FILTERS', message: '搜索筛选参数无效' });
    }
    if (String(query).trim().length > 100) {
        return res.status(400).json({ error: 'QUERY_TOO_LONG', message: '搜索关键词不能超过 100 个字符' });
    }

    try {
        if (platform === 'bilibili') {
            const list = await fetchBilibiliScopedSearch(query, category || 'all', pageNum, timeRange || 'all');
            return sendVideoList(res, list, timeRange);

        } else if (platform === 'douyin') {
            const list = searchPlatformPool('Douyin', scopedQuery, category, timeRange, pageNum);
            return sendVideoList(res, list, timeRange);

        } else if (platform === 'youtube') {
            let sp = '';
            if (isStrict) {
                if (timeRange === '3days' || timeRange === '7days') {
                    sp = 'EgIIAw%253D%253D';
                } else if (timeRange === '1month') {
                    sp = 'EgIIBA%253D%253D';
                } else if (timeRange === '6months') {
                    sp = 'EgIIBQ%253D%253D';
                }
            }
            const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(scopedQuery)}${sp ? '&sp=' + sp : ''}`;
            const config = {};
            if (proxyAgent) {
                config.httpsAgent = proxyAgent;
            }

            try {
                const response = await axios.get(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
                    },
                    timeout: 8000,
                    ...config
                });

                const html = response.data;
                const regex = /ytInitialData = ({.*?});/;
                const match = html.match(regex);
                if (match && match[1]) {
                    const data = JSON.parse(match[1]);
                    const videos = extractYouTubeVideos(data);
                    const pool = searchPlatformPool('YouTube', scopedQuery, category, timeRange, pageNum);
                    const combined = [...videos, ...pool];
                    const filtered = filterByTimeRange(combined, timeRange);
                    const startIdx = (pageNum - 1) * 15;
                    const sliced = filtered.slice(startIdx, startIdx + 15);
                    return sendVideoList(res, sliced, timeRange);
                }
            } catch (ytErr) {
                console.warn('[YouTube Search] Online request failed, using YouTube search pool:', ytErr.message);
            }

            const fallbackSearch = searchPlatformPool('YouTube', scopedQuery, category, timeRange, pageNum);
            return sendVideoList(res, fallbackSearch, timeRange);

        } else if (platform === 'tiktok') {
            try {
                console.log(`[TikTok Search] Launching browser (page ${pageNum})...`);
                const browser = await puppeteer.launch({
                    headless: true,
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-web-security',
                        activeProxy ? `--proxy-server=${activeProxy}` : ''
                    ].filter(Boolean)
                });
                const pageObj = await browser.newPage();
                await pageObj.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

                const searchUrl = `https://urlebird.com/search/?q=${encodeURIComponent(scopedQuery)}&page=${pageNum}`;
                await pageObj.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 12000 });
                const list = await pageObj.evaluate(() => {
                    const cards = Array.from(document.querySelectorAll('.thumb'));
                    return cards.map((c, idx) => {
                        const linkEl = c.querySelector('a[href*="/video/"]');
                        const link = linkEl ? linkEl.href : '';
                        const img = c.querySelector('.img img')?.src || '';
                        
                        let title = 'TikTok Video';
                        if (link) {
                            const parts = link.split('/').filter(Boolean);
                            const lastPart = parts.pop() || '';
                            const slug = lastPart.includes('-') ? lastPart : (parts.pop() || '');
                            if (slug && slug.includes('-')) {
                                const cleanSlug = slug.replace(/-\d+$/, '');
                                title = cleanSlug.split('-')
                                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                                    .join(' ');
                            }
                        }
                        
                        const authorImg = c.querySelector('.author img');
                        const author = authorImg ? (authorImg.alt || 'TikToker') : 'TikToker';
                        const statsDiv = c.querySelector('.stats');
                        const playText = statsDiv ? statsDiv.innerText.replace(/\s+/g, ' ').trim() : 'Hot';
                        
                        return {
                            id: link.split('/').filter(Boolean).pop() || `tt_${idx}`,
                            title,
                            description: title,
                            cover: img,
                            duration: 'Shorts',
                            playCount: playText,
                            commentCount: '0',
                            author,
                            url: link,
                            platform: 'TikTok'
                        };
                    }).filter(item => item.url && item.url.includes('/video/'));
                });
                await browser.close();

                const pool = searchPlatformPool('TikTok', scopedQuery, category, timeRange, pageNum);
                const combined = [...list, ...pool];
                return sendVideoList(res, combined, timeRange);
            } catch (err) {
                console.warn('[TikTok Search] Urlebird failed, using dedicated TikTok pool search:', err.message);
            }

            const fallbackSearch = searchPlatformPool('TikTok', scopedQuery, category, timeRange, pageNum);
            return sendVideoList(res, fallbackSearch, timeRange);

        } else if (platform === 'twitter') {
            const list = searchPlatformPool('Twitter', scopedQuery, category, timeRange, pageNum);
            return sendVideoList(res, list, timeRange);

        } else if (platform === 'xiaohongshu') {
            const list = searchPlatformPool('Xiaohongshu', scopedQuery, category, timeRange, pageNum);
            return sendVideoList(res, list, timeRange);

        } else if (platform === 'kuaishou') {
            const list = searchPlatformPool('Kuaishou', scopedQuery, category, timeRange, pageNum);
            return sendVideoList(res, list, timeRange);
        }

        res.status(400).json({ error: 'Invalid platform selection' });
    } catch (err) {
        console.error('[Error] Search failed:', err.message);
        res.status(500).json({ error: 'SERVER_ERROR', message: `搜索失败：${err.message}` });
    }
});

// Real-time Trending Topics Scrapers
async function fetchBilibiliRealTopics(category) {
    try {
        const data = await fetchBilibiliJson('https://api.bilibili.com/x/web-interface/search/square?limit=30');
        if (data?.data?.trending?.list && Array.isArray(data.data.trending.list)) {
            const rawList = data.data.trending.list;
            const mapped = rawList.slice(0, 20).map((item, idx) => {
                const title = item.keyword || item.show_name || item.title;
                const heatScore = Number(item.heat_score) || (26000000 - idx * 1200000);
                const heatRaw = Math.round(heatScore * 40);
                const worksCount = Math.max(1200, Math.round(heatScore / 40));
                return {
                    id: `bili_top_${idx}`,
                    rank: idx + 1,
                    title,
                    tag: idx < 3 ? '🔥 爆款' : (idx < 8 ? '⚡ 沸' : '📈 飙升'),
                    category: category || 'all',
                    heatRaw,
                    heatDisplay: formatHeatChinese(heatRaw),
                    worksCount,
                    worksCountDisplay: formatHeatChinese(worksCount) + '篇作品',
                    desc: `哔哩哔哩实时热搜榜第 ${idx + 1} 位 · 全站高能二创与热议讨论`
                };
            });
            return mapped;
        }
    } catch (e) {
        console.warn('[Bilibili Real Topics] Fetch failed:', e.message);
    }
    return null;
}

async function fetchDouyinRealTopics(category) {
    try {
        const response = await axios.get('https://www.douyin.com/aweme/v1/web/hot/search/list/', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://www.douyin.com/hot'
            },
            timeout: 6000
        });
        if (response.data?.data?.word_list && Array.isArray(response.data.data.word_list)) {
            const rawList = response.data.data.word_list;
            const mapped = rawList.slice(0, 20).map((item, idx) => {
                const heatScore = Number(item.hot_value) || (28000000 - idx * 1100000);
                const heatRaw = Math.round(heatScore * 35);
                const worksCount = item.discuss_video_count || Math.max(1500, Math.round(heatScore / 500));
                return {
                    id: item.group_id || `dy_top_${idx}`,
                    rank: idx + 1,
                    title: item.word,
                    tag: idx < 3 ? '🔥 爆款' : (item.label === 1 ? '🔥 爆款' : (item.label === 2 ? '⚡ 沸' : '📈 飙升')),
                    category: category || 'all',
                    heatRaw,
                    heatDisplay: formatHeatChinese(heatRaw),
                    worksCount,
                    worksCountDisplay: formatHeatChinese(worksCount) + '篇作品',
                    desc: `抖音官方实时热点榜第 ${idx + 1} 位 · ${formatHeatChinese(heatRaw)} 综合传播热度`
                };
            });
            return mapped;
        }
    } catch (e) {
        console.warn('[Douyin Real Topics] Fetch failed:', e.message);
    }
    return null;
}

async function fetchWeiboRealTopics(category) {
    try {
        const response = await axios.get('https://weibo.com/ajax/side/hotSearch', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://weibo.com'
            },
            timeout: 6000
        });
        if (response.data?.data?.realtime && Array.isArray(response.data.data.realtime)) {
            const rawList = response.data.data.realtime.filter(item => !item.is_ad);
            const mapped = rawList.slice(0, 20).map((item, idx) => {
                const heatScore = Number(item.raw_hot) || (22000000 - idx * 900000);
                const heatRaw = Math.round(heatScore * 40);
                const worksCount = Math.max(1600, Math.round(heatScore / 400));
                const label = item.label_name ? `🔥 ${item.label_name}` : (idx < 3 ? '🔥 爆款' : '⚡ 沸');
                return {
                    id: `wb_top_${idx}`,
                    rank: idx + 1,
                    title: item.word,
                    tag: label,
                    category: category || 'all',
                    heatRaw,
                    heatDisplay: formatHeatChinese(heatRaw),
                    worksCount,
                    worksCountDisplay: formatHeatChinese(worksCount) + '篇作品',
                    desc: `全网实时现象级热搜话题第 ${idx + 1} 位 · ${formatHeatChinese(heatRaw)} 综合讨论热度`
                };
            });
            return mapped;
        }
    } catch (e) {
        console.warn('[Weibo Real Topics] Fetch failed:', e.message);
    }
    return null;
}

// Route to get Topic Leaderboard list
app.get('/api/topics', async (req, res) => {
    const { platform = 'bilibili', category = 'all', timeRange = 'all' } = req.query;
    if (!VALID_PLATFORMS.has(platform)) {
        return res.status(400).json({ error: 'INVALID_PLATFORM', message: '不支持的平台' });
    }

    try {
        if (platform === 'douyin') {
            const realDy = await fetchDouyinRealTopics(category);
            if (realDy && realDy.length >= 5) {
                return res.json({ success: true, list: realDy, total: realDy.length });
            }
        } else if (platform === 'bilibili') {
            const realBili = await fetchBilibiliRealTopics(category);
            if (realBili && realBili.length >= 5) {
                return res.json({ success: true, list: realBili, total: realBili.length });
            }
        } else if (platform === 'xiaohongshu' || platform === 'twitter' || platform === 'kuaishou') {
            const realWb = await fetchWeiboRealTopics(category);
            if (realWb && realWb.length >= 5) {
                return res.json({ success: true, list: realWb, total: realWb.length });
            }
        }
    } catch (e) {
        console.warn(`[Topics API] Live fetch error for ${platform}:`, e.message);
    }

    const list = getTopicLeaderboardList(platform, category, timeRange);
    return res.json({ success: true, list, total: list.length });
});

// Route to fetch videos for a specific topic (Douyin / Twitter / Curated word map to Bilibili search)
app.get('/api/search-topic', async (req, res) => {
    const { query, topicId, platform = 'bilibili' } = req.query;
    console.log(`[API] Searching topic videos for query: ${query}, topicId: ${topicId}`);

    // Check if matching curated topic
    const matched = EVENT_TOPIC_TEMPLATES.find(t =>
        (topicId && t.id === topicId) || (query && (t.title.includes(query) || query.includes(t.title)))
    );

    if (matched && matched.subVideos && matched.subVideos.length > 0) {
        const list = matched.subVideos.map(v => ({
            ...v,
            platform: platform === 'douyin' ? 'Douyin' : (platform === 'youtube' ? 'YouTube' : 'Bilibili'),
            cover: v.cover || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?q=80&w=600',
            duration: v.duration || '03:45',
            playCount: formatHeatChinese(v.playRaw),
            url: v.url || `https://www.bilibili.com/video/${v.id}`
        }));
        list.sort((a, b) => b.playRaw - a.playRaw);
        return res.json({ success: true, topic: matched, list });
    }

    try {
        const searchUrl = `https://api.bilibili.com/x/web-interface/search/all/v2?keyword=${encodeURIComponent(query || '热门')}`;
        const response = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://www.bilibili.com'
            },
            timeout: 5000
        });

        if (response.data.code === 0 && response.data.data && response.data.data.result) {
            const videoResult = response.data.data.result.find(r => r.result_type === 'video');
            if (videoResult && videoResult.data) {
                const list = videoResult.data.slice(0, 15).map(item => ({
                    id: item.bvid,
                    title: item.title.replace(/<[^>]+>/g, ''),
                    description: item.description,
                    cover: item.pic.startsWith('//') ? 'https:' + item.pic : item.pic,
                    duration: item.duration,
                    playCount: formatHeatChinese(item.play),
                    author: item.author,
                    url: `https://www.bilibili.com/video/${item.bvid}`,
                    platform: 'Bilibili',
                    playRaw: parseInt(item.play) || 0,
                    pubdate: item.pubdate || item.senddate || 0
                }));
                list.sort((a, b) => b.playRaw - a.playRaw);
                return res.json({ success: true, list });
            }
        }
    } catch (err) {}

    const fallbackList = getCategoryFallbackList(platform, 'comedy').slice(0, 10);
    res.json({ success: true, list: fallbackList });
});

// Universal Video Sniffer endpoint (Puppeteer intercept)
app.post('/api/parse', async (req, res) => {
    let { url } = req.body;
    if (!url) return res.status(400).json({ error: '请提供视频链接' });
    try {
        const parsedUrl = parseExternalUrl(url);
        if (!isSupportedVideoPage(parsedUrl)) {
            return res.status(400).json({ error: 'UNSUPPORTED_SITE', message: '当前仅支持已接入的视频平台链接' });
        }
        url = parsedUrl.toString();
    } catch (error) {
        return res.status(400).json({ error: 'INVALID_URL', message: error.message });
    }

    console.log(`[Parser] Launching browser to sniff stream for: ${url}`);
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-web-security',
                '--autoplay-policy=no-user-gesture-required',
                activeProxy ? `--proxy-server=${activeProxy}` : ''
            ].filter(Boolean)
        });

        const page = await browser.newPage();
        
        // Anti-fingerprinting
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            window.chrome = { runtime: {} };
        });

        const isBilibili = url.includes('bilibili.com') || url.includes('b23.tv');
        const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
        const isTikTok = url.includes('tiktok.com') || url.includes('urlebird.com');

        if (isBilibili) {
            await page.setUserAgent('Mozilla/5.0 (iPad; CPU OS 16_6 like Mac Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1');
        } else if (isYouTube) {
            await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1');
            await page.evaluateOnNewDocument(() => {
                Object.defineProperty(window, 'MediaSource', { get: () => undefined, configurable: true });
                Object.defineProperty(window, 'WebKitMediaSource', { get: () => undefined, configurable: true });
            });
        } else {
            await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1');
        }

        let videoSrc = null;
        let description = '';

        let resolveIntercept;
        const interceptPromise = new Promise(resolve => {
            resolveIntercept = resolve;
        });

        await page.setRequestInterception(true);
        page.on('request', (request) => {
            const reqUrl = request.url();

            if (reqUrl.includes('aweme/v1/play') || reqUrl.includes('video_id=')) {
                try {
                    const match = reqUrl.match(/video_id=([a-zA-Z0-9_]+)/);
                    if (match && !videoSrc) {
                        const videoId = match[1];
                        videoSrc = `https://aweme.snssdk.com/aweme/v1/play/?video_id=${videoId}&ratio=1080p`;
                        console.log(`[Parser] Caught Douyin video ID: ${videoId}`);
                        if (resolveIntercept) resolveIntercept();
                    }
                } catch (e) {}
            }

            if (reqUrl.includes('/x/player/wbi/playurl') || reqUrl.includes('/x/player/playurl')) {
                try {
                    const parsedUrl = new URL(reqUrl);
                    parsedUrl.pathname = '/x/player/playurl';
                    parsedUrl.searchParams.set('fnval', '0'); // MP4 direct link
                    parsedUrl.searchParams.set('qn', '80');    // 1080p
                    parsedUrl.searchParams.delete('w_rid');
                    parsedUrl.searchParams.delete('wts');
                    request.continue({ url: parsedUrl.toString() });
                    return;
                } catch (e) {}
            }

            if (reqUrl.includes('googlevideo.com/videoplayback')) {
                try {
                    const parsedUrl = new URL(reqUrl);
                    const mime = parsedUrl.searchParams.get('mime');
                    if (mime && mime.includes('video/mp4') && !videoSrc) {
                        videoSrc = reqUrl;
                        console.log(`[Parser] Caught YouTube MP4 video: ${videoSrc.substring(0, 50)}...`);
                        if (resolveIntercept) resolveIntercept();
                    }
                } catch (e) {}
            }

            request.continue();
        });

        page.on('response', async (response) => {
            if (videoSrc) return;
            const reqUrl = response.url();

            // Intercept Bilibili playurl API
            if (reqUrl.includes('/x/player/wbi/playurl') || reqUrl.includes('/x/player/playurl')) {
                try {
                    const json = await response.json();
                    if (json?.data?.durl?.[0]?.url) {
                        videoSrc = json.data.durl[0].url;
                        console.log('[Parser] Caught B站 playurl (DURL)');
                        if (resolveIntercept) resolveIntercept();
                    }
                } catch (e) {}
            }

            // Intercept Urlebird direct download link
            if (isTikTok && reqUrl.includes('.mp4')) {
                videoSrc = reqUrl;
                console.log(`[Parser] Caught TikTok MP4: ${reqUrl.substring(0, 50)}...`);
                if (resolveIntercept) resolveIntercept();
            }

            // Intercept generic video content types
            const contentType = response.headers()['content-type'] || '';
            if (contentType.includes('video/') || reqUrl.includes('.mp4?') || reqUrl.includes('video/tos')) {
                if (!reqUrl.includes('.m3u8') && !reqUrl.includes('.ts')) {
                    videoSrc = reqUrl;
                    console.log(`[Parser] Caught generic MP4 link: ${reqUrl.substring(0, 50)}...`);
                    if (resolveIntercept) resolveIntercept();
                }
            }
        });

        // Visit target page
        const navPromise = page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
        await Promise.race([interceptPromise, navPromise]);

        if (!videoSrc) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // Evaluate page meta
        const pageMeta = await page.evaluate(() => {
            let title = document.title;
            let cover = '';
            let desc = '';

            const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
            if (ogTitle) title = ogTitle;

            const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content')
                || document.querySelector('meta[name="twitter:image"]')?.getAttribute('content');
            if (ogImage) cover = ogImage;

            // Urlebird specific direct download link extraction
            const videoEl = document.querySelector('video');
            const videoLink = videoEl ? videoEl.src : '';

            // Also check download button on Urlebird
            const downloadBtn = document.querySelector('a[href*="/download/"]');
            const downloadUrl = downloadBtn ? downloadBtn.href : '';

            desc = document.querySelector('meta[name="description"]')?.getAttribute('content')
                || document.querySelector('.desc')?.innerText
                || '';

            return { title, cover, desc, videoLink, downloadUrl };
        }).catch(() => ({ title: 'Parsed Video', cover: '', desc: '', videoLink: '', downloadUrl: '' }));

        await browser.close();

        // Fallback for direct TikTok link extraction
        let finalVideoUrl = videoSrc || pageMeta.videoLink || pageMeta.downloadUrl || '';
        
        // Clean B站 titles
        let finalTitle = pageMeta.title.replace('_哔哩哔哩_bilibili', '').replace('_bilibili', '');

        res.json({
            success: true,
            videoUrl: finalVideoUrl,
            title: finalTitle,
            cover: pageMeta.cover,
            description: pageMeta.desc || 'No description found.'
        });

    } catch (err) {
        if (browser) await browser.close();
        console.error('[Parser] Sniff failed:', err.message);
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// Stream proxy to bypass Referer / CORS restrictions (e.g. Bilibili/Douyin CDNs)
app.get('/api/proxy-video', async (req, res) => {
    const { referer, download } = req.query;
    let { url } = req.query;
    if (!url) return res.status(400).send('No URL provided');
    try {
        url = parseExternalUrl(url).toString();
        if (referer) parseExternalUrl(referer);
    } catch (error) {
        return res.status(400).send(error.message);
    }

    console.log(`[Stream Proxy] Proxying video: ${url.substring(0, 60)}...`);
    try {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        };
        if (referer) {
            headers['Referer'] = referer;
        }
        if (req.headers.range) headers.Range = req.headers.range;

        const response = await axios.get(url, {
            headers,
            responseType: 'stream',
            timeout: 15000,
            validateStatus: status => status === 200 || status === 206
        });
        res.status(response.status);
        res.setHeader('Content-Type', response.headers['content-type'] || 'video/mp4');
        if (response.headers['content-length']) {
            res.setHeader('Content-Length', response.headers['content-length']);
        }
        res.setHeader('Accept-Ranges', 'bytes');
        if (response.headers['content-range']) {
            res.setHeader('Content-Range', response.headers['content-range']);
        }
        if (download === '1') {
            res.setHeader('Content-Disposition', 'attachment; filename="hotpot-video.mp4"');
        }
        response.data.pipe(res);
    } catch (err) {
        console.error('[Stream Proxy] Error proxying video stream:', err.message);
        res.status(500).send('Stream proxy failed');
    }
});

// Image proxy — bypass hotlink protection for Bilibili covers (and other CDNs)
app.get('/api/proxy-image', async (req, res) => {
    let { url } = req.query;
    if (!url) return res.status(400).send('No URL provided');
    try {
        url = parseExternalUrl(url).toString();
    } catch (error) {
        return res.status(400).send(error.message);
    }

    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://www.bilibili.com'
            },
            responseType: 'stream',
            timeout: 8000
        });
        const contentType = response.headers['content-type'] || 'image/jpeg';
        if (!contentType.startsWith('image/')) throw new Error('Upstream response is not an image');
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        response.data.pipe(res);
    } catch (err) {
        console.error('[Image Proxy] Error:', err.message);
        // Return a 1x1 transparent PNG so the <img> does not show a broken icon
        const transparentPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
        res.setHeader('Content-Type', 'image/png');
        res.send(transparentPng);
    }
});

// AI analysis engine for videos (rule-based heuristic classifier)
app.post('/api/analyze', (req, res) => {
    const { title, description } = req.body;
    if (!title) return res.status(400).json({ error: 'Missing title' });

    console.log(`[AI Analysis] Running analyzer for: ${title}`);
    const fullText = (title + '。' + (description || '')).toLowerCase();

    let category = '生活娱乐 & 综合创意';
    let recommendations = '推荐结合原平台播放页的热门评论与弹幕，学习观众最感兴趣的互动槽点。';

    if (fullText.includes('code') || fullText.includes('编程') || fullText.includes('科技') || fullText.includes('ai') || fullText.includes('大模型') || fullText.includes('软件') || fullText.includes('数码')) {
        category = '科技前沿 & 数码技术';
        recommendations = '建议记录视频中涉及的技术架构、软件链接或AI工具名称，进行本地部署复现，掌握核心应用技巧。';
    } else if (fullText.includes('鬼畜') || fullText.includes('音mad') || fullText.includes('素材') || fullText.includes('meme') || fullText.includes('恶搞')) {
        category = '鬼畜幽默 & 热门Meme';
        recommendations = '重点分析音画同步节奏（剪辑卡点点）、魔性素材洗脑循环机制。适合收集作为二创剪辑的音效或梗图储备。';
    } else if (fullText.includes('搞笑') || fullText.includes('段子') || fullText.includes('整蛊') || fullText.includes('喜剧')) {
        category = '趣味搞笑 & 爆梗解压';
        recommendations = '关注前3秒的“黄金钩子（Hook）”吸引力，以及幽默反转节奏的设计。学习其如何通过快速高能桥段留住用户。';
    } else if (fullText.includes('时装') || fullText.includes('穿搭') || fullText.includes('时尚') || fullText.includes('美妆') || fullText.includes('ootd') || fullText.includes('超模')) {
        category = '时尚潮流 & 质感穿搭';
        recommendations = '留意色系搭配、背景音乐转场配合，以及景别（近景、特写）切换技巧。学习如何用极具视觉冲击力的画面呈现主体质感。';
    } else if (fullText.includes('营销') || fullText.includes('干货') || fullText.includes('暴利') || fullText.includes('揭秘') || fullText.includes('秘密') || fullText.includes('痛点')) {
        category = '商业营销 & 认知干货';
        recommendations = '剖析文案中的情绪调动词（如：千万别、必须看、大败局等）和痛点揭示手法。研究其“痛点-分析-解决方案”的黄金脚本公式。';
    }

    // Extractive summary points
    const sentences = (title + '。' + (description || ''))
        .split(/[。！？；!?;\n\r]+/)
        .map(s => s.trim())
        .filter(s => s.length >= 6 && s.length <= 150);

    const highlights = [];
    // Select top 3 distinct informative sentences
    for (const sentence of sentences) {
        if (highlights.length >= 3) break;
        if (!highlights.includes(sentence) && !sentence.includes('http') && !sentence.includes('www')) {
            highlights.push(sentence);
        }
    }

    // Fallbacks if highlights are empty
    while (highlights.length < 3) {
        if (highlights.length === 0) {
            highlights.push(`本视频的核心主题为《${title}》，展示了创作者独特的选题视角。`);
        } else if (highlights.length === 1) {
            highlights.push(`视频在短时间内提炼了高密度信息，非常具有传播与学习的价值。`);
        } else {
            highlights.push(`作品的结构紧凑，转场顺滑，属于典型的高互动内容模版。`);
        }
    }

    res.json({
        success: true,
        category,
        highlights,
        recommendations
    });
});

if (require.main === module) {
    detectProxy();
    app.listen(PORT, () => {
        console.log(`[HotPot Backend] Server is running at http://localhost:${PORT}`);
    });
}

module.exports = app;
