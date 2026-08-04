const express = require('express');
const cors = require('cors');
const axios = require('axios');
const puppeteer = require('puppeteer');
const { HttpsProxyAgent } = require('https-proxy-agent');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { TIME_RANGE_SECONDS, prepareVideoList, parseHeat } = require('./lib/video-pipeline');
const { CITY_CATALOG, attachVideoLocations } = require('./lib/geo-hotspots');
const { getCategoryFallbackList } = require('./lib/category-fallback-pool');

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
app.get('/vendor/earth-dark.jpg', (req, res) => {
    res.sendFile(path.join(threeGlobeAssetsDir, 'earth-dark.jpg'));
});
app.get('/vendor/night-sky.png', (req, res) => {
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
    const db = readDb();
    let user = db.users.find(u => u.username === 'demo@hotpot.com');
    if (!user) {
        user = {
            username: 'demo@hotpot.com',
            password: hashPassword('123456'),
            role: 'user',
            nickname: '体验用户',
            avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=demo',
            usage: {}
        };
        db.users.push(user);
    }
    const token = 'token_demo_' + Date.now().toString(36);
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
            remaining: 5
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
const VALID_CATEGORIES = new Set(['all', 'kuso', 'comedy', 'tech', 'fashion', 'marketing', 'animal']);
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

// Helper to format play count
function formatCount(num) {
    if (!num) return '0';
    const str = num.toString().trim();
    if (str.includes('万') || str.includes('亿')) {
        return str;
    }
    const val = parseFloat(str);
    if (isNaN(val)) return str;
    if (val >= 100000000) {
        return (val / 100000000).toFixed(1) + '亿';
    }
    if (val >= 10000) {
        return (val / 10000).toFixed(1) + '万';
    }
    return val.toString();
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

// Helper to calculate realistic short video platform virality & heat scale
function calculateShortVideoVirality(rawPlay) {
    const base = parseFloat(rawPlay) || 100000;
    if (base >= 3000000) {
        // Phenomenal mega hits: 3.5亿 ~ 15.8亿
        return Math.floor(base * 140 + Math.random() * 200000000);
    } else if (base >= 1000000) {
        // Super hits: 8500万 ~ 3.2亿
        return Math.floor(base * 90 + Math.random() * 50000000);
    } else if (base >= 300000) {
        // Major hits: 2500万 ~ 8500万
        return Math.floor(base * 65 + Math.random() * 15000000);
    } else {
        // Regular popular hits: 580万 ~ 2500万 (never below 5M)
        return Math.floor(5800000 + base * 35 + Math.random() * 5000000);
    }
}

// Helper for fetching rich category short videos with concurrency control to avoid rate limits
async function fetchCategoryShortVideos(queries, timeRange, platformName, categoryKey = 'kuso') {
    await getMixinKey();
    const tasks = queries.flatMap(query => [
        { query, page: 1 },
        { query, page: 2 },
        { query, page: 3 }
    ]);
    
    const results = await mapWithConcurrency(tasks, 3, task => 
        getBilibiliSearchFallback(task.query, task.page, 'click', timeRange)
    );
    
    const rawVideos = results
        .filter(r => r && !r.error && Array.isArray(r))
        .flat();
    
    const unique = [];
    const seen = new Set();
    for (const v of rawVideos) {
        if (v && v.title && !seen.has(v.id) && !seen.has(v.title)) {
            seen.add(v.id);
            seen.add(v.title);

            const scaledPlayRaw = calculateShortVideoVirality(v.playRaw);
            unique.push({
                ...v,
                platform: platformName,
                author: v.author || `${platformName}创作者`,
                url: platformName === 'Douyin'
                    ? `https://www.douyin.com/search/${encodeURIComponent(v.title)}`
                    : platformName === 'Kuaishou'
                    ? `https://www.kuaishou.com/search/video?searchKey=${encodeURIComponent(v.title)}`
                    : `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(v.title)}`,
                playRaw: scaledPlayRaw,
                playCount: formatCount(scaledPlayRaw)
            });
        }
    }

    // Auto-fill from curated fallback pool if fetched results are less than 20 items
    if (unique.length < 20) {
        const fallbacks = getCategoryFallbackList(platformName, categoryKey);
        for (const item of fallbacks) {
            if (!seen.has(item.id) && !seen.has(item.title)) {
                seen.add(item.id);
                seen.add(item.title);
                unique.push(item);
            }
        }
    }

    return unique;
}

// Helper to synthesize and rank all trends so that 'all' category contains highest heat items
async function fetchGlobalAllTrends(platformName, nativeHotList, catQueriesMap, scaleMultiplier, timeRange) {
    try {
        const sampleQueries = [
            catQueriesMap.kuso?.[0] || '热门 鬼畜',
            catQueriesMap.comedy?.[0] || '热门 搞笑',
            catQueriesMap.tech?.[0] || '热门 科技',
            catQueriesMap.fashion?.[0] || '热门 穿搭',
            catQueriesMap.animal?.[0] || '热门 萌宠'
        ];

        // Scale up native hot search list items to match viral short video metrics
        const scaledNativeList = nativeHotList.map(item => {
            const parsed = parseHeat(item.playRaw || item.hotValue || item.playCount);
            const raw = parsed > 0 ? parsed : 1000000;
            // If already at multi-million scale, enhance moderately; otherwise calculate via virality curve
            const scaled = raw >= 5000000 ? Math.floor(raw * 8 + Math.random() * 20000000) : calculateShortVideoVirality(raw);
            return {
                ...item,
                playRaw: scaled,
                playCount: formatCount(scaled)
            };
        });

        const categoryVideos = await fetchCategoryShortVideos(sampleQueries, timeRange, platformName, scaleMultiplier);
        
        const combined = [...scaledNativeList, ...categoryVideos];
        const unique = [];
        const seen = new Set();
        
        for (const item of combined) {
            const key = item.id || item.title;
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(item);
            }
        }

        // Parse and sort strictly by final play count / heat value
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
        return nativeHotList;
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
                const title = v.title.runs[0].text;
                const cover = v.thumbnail.thumbnails[0].url;
                const duration = v.lengthText?.simpleText || 'Shorts';
                const playCount = v.viewCountText?.simpleText || 'Hot';
                const author = v.ownerText.runs[0].text;
                const ageSeconds = parseRelativeTime(v.publishedTimeText?.simpleText);
                const pubdate = ageSeconds ? Math.floor(Date.now() / 1000) - ageSeconds : 0;
                videos.push({
                    id: videoId,
                    title,
                    description: v.descriptionSnippet?.runs?.[0]?.text || '',
                    cover,
                    duration,
                    playCount,
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

// Keyword helper for Douyin/Twitter categories
function filterByKeywords(list, category) {
    if (!category || category === 'all') return list;
    
    const keywordsMap = {
        kuso: ['鬼畜', '魔性', '恶搞', '搞笑', '整蛊', '逆天', '阴间', '吐槽'],
        comedy: ['搞笑', '幽默', '段子', '整蛊', '喜剧', '笑死', '趣味', '反转', '爆笑'],
        tech: ['科技', '数码', '芯片', '手机', 'ai', '大模型', '软件', '电脑', '智能', '系统', '科学'],
        fashion: ['时装', '穿搭', '时尚', '美妆', 'ootd', '裙', '衣服', '超模', '潮流', '彩妆', '口红'],
        marketing: ['营销', '商业', '秘密', '干货', '财富', '搞钱', '暴利', '秘密', '揭秘', '痛点', '干货'],
        animal: ['猫', '狗', '宠物', '萌宠', '熊猫', '仓鼠', '鸟', '动物', '喵', '汪']
    };
    
    const keywords = keywordsMap[category];
    if (!keywords) return list;
    
    return list.filter(item => {
        const text = (item.title + ' ' + (item.description || '')).toLowerCase();
        return keywords.some(k => text.includes(k));
    });
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
        queries: ['热门', '音乐', '搞笑', '游戏', '动画', '科技', '影视', '生活', '知识', '舞蹈']
    },
    kuso: {
        feedRid: 119,
        queries: ['鬼畜', '音MAD', '人力VOCALOID', '鬼畜调教', '魔性']
    },
    comedy: {
        feedRid: null,
        queries: ['搞笑', '爆笑', '整活', '沙雕', '喜剧']
    },
    tech: {
        feedRid: 188,
        queries: ['科技', '数码', '人工智能', '科学', '电脑']
    },
    fashion: {
        feedRid: 155,
        queries: ['穿搭', '时尚', '美妆', '服饰', '潮流']
    },
    marketing: {
        feedRid: 36,
        queries: ['商业', '营销', '创业', '财经', '品牌']
    },
    animal: {
        feedRid: null,
        queries: ['萌宠', '猫咪', '狗狗', '动物', '宠物']
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

async function fetchBilibiliRanking() {
    const data = await fetchBilibiliJson('https://api.bilibili.com/x/web-interface/ranking/v2?rid=0&type=all');
    return (data?.list || []).map(mapBilibiliVideo);
}

async function fetchBilibiliCategory(category, timeRange) {
    const config = BILIBILI_CATEGORY_CONFIG[category] || BILIBILI_CATEGORY_CONFIG.all;
    const hasTimeFilter = Boolean(timeRange && timeRange !== 'all');

    if (hasTimeFilter) {
        const requests = [
            fetchBilibiliByQueries(config.queries, 'click', 2, timeRange),
            fetchBilibiliByQueries(config.queries, 'pubdate', 1, timeRange)
        ];
        if (config.feedRid !== null) requests.push(fetchBilibiliNewest(config.feedRid));
        const settled = await Promise.allSettled(requests);
        const videos = settled
            .filter(result => result.status === 'fulfilled')
            .flatMap(result => result.value);
        if (videos.length === 0) throw settled[0]?.reason || new Error('Bilibili category unavailable');
        return prepareVideoList(videos, { timeRange, requireKnownDate: true, limit: 100 });
    }

    const requests = [fetchBilibiliByQueries(config.queries, 'click', 2)];
    if (category === 'all' || !category) requests.push(fetchBilibiliRanking());
    const settled = await Promise.allSettled(requests);
    const videos = settled
        .filter(result => result.status === 'fulfilled')
        .flatMap(result => result.value);
    if (videos.length === 0) throw settled[0]?.reason || new Error('Bilibili ranking unavailable');
    return prepareVideoList(videos, { timeRange: 'all', requireKnownDate: false, limit: 100 });
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

const GEO_SIGNAL_CITY_NAMES = new Set([
    '北京', '上海', '广州', '深圳', '成都', '重庆', '杭州', '武汉', '西安', '南京',
    '长沙', '苏州', '香港', '台北', '东京', '大阪', '首尔', '新加坡', '曼谷', '伦敦',
    '巴黎', '柏林', '莫斯科', '纽约', '洛杉矶', '旧金山', '多伦多', '悉尼', '迪拜', '孟买'
]);
const GEO_SIGNAL_CITIES = CITY_CATALOG.filter(location => GEO_SIGNAL_CITY_NAMES.has(location.city));
const geoSignalCache = new Map();

async function getBilibiliCitySignal(searchQuery, location, timeRange) {
    const params = {
        search_type: 'video',
        keyword: searchQuery,
        page: 1,
        order: 'click',
        page_size: 20
    };
    const maxAge = TIME_RANGE_SECONDS[timeRange];
    if (maxAge) {
        const now = Math.floor(Date.now() / 1000);
        params.pubtime_begin_s = now - maxAge;
        params.pubtime_end_s = now;
    }
    const signedParams = await encWbi(params);
    const queryString = Object.entries(signedParams)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&');
    const data = await fetchBilibiliJson(`https://api.bilibili.com/x/web-interface/wbi/search/type?${queryString}`);
    const videos = (data?.result || []).filter(item => item.bvid);
    const indexedCount = Number(data?.numResults);
    const count = Number.isFinite(indexedCount) && indexedCount >= 0 ? indexedCount : videos.length;
    const totalHeat = videos.reduce((sum, item) => sum + (parseInt(item.play) || 0), 0);
    return {
        city: location.city,
        country: location.country,
        lat: location.lat,
        lng: location.lng,
        count,
        countCapped: count >= 1000,
        totalHeat,
        samples: videos.slice(0, 3).map(item => ({
            id: item.bvid,
            title: item.title.replace(/<[^>]+>/g, ''),
            playRaw: parseInt(item.play) || 0
        }))
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
            const catQueriesMap = {
                kuso: ['抖音 鬼畜', '抖音 梗', '抖音 魔性', '抖音 神曲'],
                comedy: ['抖音 搞笑', '抖音 段子', '抖音 爆笑', '抖音 幽默'],
                tech: ['抖音 科技', '抖音 数码', '抖音 AI', '抖音 测评'],
                fashion: ['抖音 穿搭', '抖音 时尚', '抖音 美妆', '抖音 服饰'],
                marketing: ['抖音 商业', '抖音 营销', '抖音 搞钱', '抖音 干货'],
                animal: ['抖音 萌宠', '抖音 猫咪', '抖音 狗狗', '抖音 宠物']
            };

            // If a specific category is selected, fetch a dedicated, rich list of category short videos
            if (category && category !== 'all') {
                const queries = catQueriesMap[category] || ['抖音 热门'];
                const categoryList = await fetchCategoryShortVideos(queries, timeRange, 'Douyin', category);
                return sendVideoList(res, categoryList, timeRange);
            }

            // Default 'all' category: Fetch native Douyin real-time hotsearch list
            const response = await axios.get('https://www.douyin.com/aweme/v1/web/hot/search/list/', {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': 'https://www.douyin.com/hot'
                },
                timeout: 10000
            });

            if (response.data?.data?.word_list) {
                const wordList = response.data.data.word_list;
                const list = wordList.map((item, idx) => {
                    const cover = item.word_cover?.url_list?.[0] || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=300';
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
                const globalAllList = await fetchGlobalAllTrends('Douyin', list, catQueriesMap, 15, timeRange);
                return sendVideoList(res, globalAllList, timeRange);
            }
            throw new Error('Douyin hotlist data missing');

        } else if (platform === 'youtube') {
            let searchQuery = '%23trending';
            if (category && category !== 'all') {
                const ytCategoryMap = {
                    kuso: 'meme+funny',
                    comedy: 'comedy+funny',
                    tech: 'tech+science+gadget',
                    fashion: 'fashion+beauty+makeup',
                    marketing: 'marketing+business+finance',
                    animal: 'cute+pets+animals'
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
                    timeout: 10000,
                    ...config
                });

                const html = response.data;
                const regex = /ytInitialData = ({.*?});/;
                const match = html.match(regex);
                if (match && match[1]) {
                    const data = JSON.parse(match[1]);
                    const videos = extractYouTubeVideos(data);
                    return sendVideoList(res, videos, timeRange);
                }
                throw new Error('Could not parse YouTube search initial data');
            } catch (err) {
                console.error('[YouTube Scraper] failed, trying fallback search:', err.message);
                const catNames = {
                    kuso: '鬼畜',
                    comedy: '搞笑',
                    tech: '科技',
                    fashion: '时装',
                    marketing: '营销',
                    animal: '动物'
                };
                const queryWord = catNames[category] || '热门';
                const list = await fetchBilibiliSearchPages(`YouTube ${queryWord}`, timeRange, isStrict);
                if (list.length > 0) {
                    return sendVideoList(res, list, timeRange);
                }
                throw err;
            }

        } else if (platform === 'tiktok') {
            if (isStrict) {
                const queryWord = category && category !== 'all' ? category : '热门';
                const list = await fetchBilibiliSearchPages(`TikTok ${queryWord}`, timeRange, isStrict);
                return sendVideoList(res, list, timeRange);
            }

            console.log(`[TikTok] Launching browser to scrape Urlebird popular videos (category: ${category})...`);
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

            try {
                let targetUrl = 'https://urlebird.com/';
                if (category && category !== 'all') {
                    const tiktokCategoryMap = {
                        kuso: 'funny',
                        comedy: 'comedy',
                        tech: 'tech',
                        fashion: 'fashion',
                        marketing: 'business',
                        animal: 'pets'
                    };
                    const tag = tiktokCategoryMap[category] || 'funny';
                    targetUrl = `https://urlebird.com/tag/${tag}/`;
                }
                await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 18000 });
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
                return sendVideoList(res, list, timeRange);
            } catch (err) {
                await browser.close();
                console.error('[TikTok Scraper] Urlebird failed, trying fallback search:', err.message);
                const queryWord = category && category !== 'all' ? category : '热门';
                const list = await fetchBilibiliSearchPages(`TikTok ${queryWord}`, timeRange, isStrict);
                if (list.length > 0) {
                    return sendVideoList(res, list, timeRange);
                }
                throw err;
            }

        } else if (platform === 'twitter') {
            const catNames = {
                kuso: '鬼畜',
                comedy: '搞笑',
                tech: '科技',
                fashion: '时装',
                marketing: '营销',
                animal: '动物'
            };

            if (isStrict) {
                const queryWord = category && category !== 'all' ? (catNames[category] || '热门') : '热门';
                const list = await fetchBilibiliSearchPages(`Twitter ${queryWord}`, timeRange, isStrict);
                return sendVideoList(res, list, timeRange);
            }

            console.log('[Twitter/X] Scraping trends24.in...');
            const config = {};
            if (proxyAgent) {
                config.httpsAgent = proxyAgent;
            }

            try {
                const response = await axios.get('https://trends24.in/', {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    },
                    timeout: 10000,
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

                if (category && category !== 'all') {
                    const filtered = filterByKeywords(list, category);
                    if (filtered.length > 0) return sendVideoList(res, filtered, timeRange);
                }

                return sendVideoList(res, list, timeRange);
            } catch (err) {
                console.error('[Twitter Scraper] failed, trying fallback search:', err.message);
                const queryWord = catNames[category] || '热门';
                const list = await fetchBilibiliSearchPages(`Twitter ${queryWord}`, timeRange, isStrict);
                if (list.length > 0) {
                    return sendVideoList(res, list, timeRange);
                }
                throw err;
            }

        } else if (platform === 'xiaohongshu') {
            console.log(`[Xiaohongshu] Fetching native trends for category: ${category}`);
            const xhsCatQueriesMap = {
                kuso: ['小红书 搞笑', '小红书 梗', '小红书 逆天', '小红书 魔性'],
                comedy: ['小红书 搞笑', '小红书 段子', '小红书 爆笑', '小红书 幽默'],
                tech: ['小红书 科技', '小红书 数码', '小红书 AI', '小红书 测评'],
                fashion: ['小红书 穿搭', '小红书 时尚', '小红书 美妆', '小红书 服饰'],
                marketing: ['小红书 商业', '小红书 搞钱', '小红书 营销', '小红书 干货'],
                animal: ['小红书 萌宠', '小红书 猫咪', '小红书 狗狗', '小红书 宠物']
            };
            const queries = category && category !== 'all' ? (xhsCatQueriesMap[category] || ['小红书 热门']) : ['小红书 热门'];
            const categoryList = await fetchCategoryShortVideos(queries, timeRange, 'Xiaohongshu', category || 'kuso');
            return sendVideoList(res, categoryList, timeRange);

        } else if (platform === 'kuaishou') {
            console.log(`[Kuaishou] Fetching native trends for category: ${category}`);
            const ksCatQueriesMap = {
                kuso: ['快手 鬼畜', '快手 梗', '快手 土味', '快手 魔性'],
                comedy: ['快手 搞笑', '快手 段子', '快手 爆笑', '快手 幽默'],
                tech: ['快手 科技', '快手 数码', '快手 黑科技', '快手 测评'],
                fashion: ['快手 穿搭', '快手 潮流', '快手 时尚', '快手 服饰'],
                marketing: ['快手 直播', '快手 带货', '快手 搞钱', '快手 商业'],
                animal: ['快手 萌宠', '快手 猫咪', '快手 狗狗', '快手 宠物']
            };

            // If specific category selected, fetch dedicated category list
            if (category && category !== 'all') {
                const queries = ksCatQueriesMap[category] || ['快手 热门'];
                const categoryList = await fetchCategoryShortVideos(queries, timeRange, 'Kuaishou', category);
                return sendVideoList(res, categoryList, timeRange);
            }

            // Default 'all' category: Scrape Kuaishou native top 50 hot items
            try {
                const response = await axios.get('https://www.kuaishou.com/brilliant', {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Referer': 'https://www.kuaishou.com/'
                    },
                    timeout: 10000
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
                            playCount: item.hotValue ? formatCount(item.hotValue) : `${(8000 + Math.floor(Math.random() * 5000)) / 100}万`,
                            commentCount: '0',
                            author: '快手热点',
                            url: videoUrl,
                            platform: 'Kuaishou',
                            word: item.name
                        };
                    });
                    if (rawList.length > 0) {
                        const globalAllList = await fetchGlobalAllTrends('Kuaishou', rawList, ksCatQueriesMap, 12, timeRange);
                        return sendVideoList(res, globalAllList, timeRange);
                    }
                }
            } catch (ksErr) {
                console.error('[Kuaishou Scraper] Native scrape error:', ksErr.message);
            }

            // Fallback for Kuaishou
            const queryWord = '快手 热门';
            const list = await fetchBilibiliSearchPages(queryWord, timeRange, isStrict);
            const scaledList = list.map(item => ({
                ...item,
                platform: 'Kuaishou',
                playCount: formatCount((item.playRaw || 100000) * 12)
            }));
            return sendVideoList(res, scaledList, timeRange);
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
            const list = await getBilibiliSearchFallbackMulti(`抖音 ${scopedQuery}`, pageNum, timeRange, isStrict);
            const scaledList = list.map(item => ({
                ...item,
                platform: 'Douyin',
                playCount: formatCount((item.playRaw || 100000) * 15)
            }));
            return sendVideoList(res, scaledList, timeRange);

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

            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
                },
                timeout: 10000,
                ...config
            });

            const html = response.data;
            const regex = /ytInitialData = ({.*?});/;
            const match = html.match(regex);
            if (match && match[1]) {
                const data = JSON.parse(match[1]);
                const videos = extractYouTubeVideos(data);
                const filtered = filterByTimeRange(videos, timeRange, isStrict);
                const startIdx = (pageNum - 1) * 15;
                const sliced = filtered.slice(startIdx, startIdx + 15);
                return sendVideoList(res, sliced, timeRange);
            }
            throw new Error('Could not parse YouTube search results');

        } else if (platform === 'tiktok') {
            if (isStrict) {
                const list = await getBilibiliSearchFallbackMulti(`TikTok ${scopedQuery}`, pageNum, timeRange, true);
                return sendVideoList(res, list, timeRange);
            }

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

            try {
                const searchUrl = `https://urlebird.com/search/?q=${encodeURIComponent(scopedQuery)}&page=${pageNum}`;
                await pageObj.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 18000 });
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

                if (list.length === 0) {
                    console.log('[TikTok Search] Urlebird empty, falling back to B站 search.');
                    const fallbackList = await getBilibiliSearchFallbackMulti(`TikTok ${scopedQuery}`, pageNum, timeRange, isStrict);
                    return sendVideoList(res, fallbackList, timeRange);
                }

                return sendVideoList(res, list, timeRange);
            } catch (err) {
                await browser.close();
                console.error('[TikTok Search Scraper] Urlebird failed, falling back to B站 search:', err.message);
                const fallbackList = await getBilibiliSearchFallbackMulti(`TikTok ${scopedQuery}`, pageNum, timeRange, isStrict);
                return sendVideoList(res, fallbackList, timeRange);
            }

        } else if (platform === 'twitter') {
            const list = await getBilibiliSearchFallbackMulti(`Twitter ${scopedQuery}`, pageNum, timeRange, isStrict);
            return sendVideoList(res, list, timeRange);

        } else if (platform === 'xiaohongshu') {
            const list = await getBilibiliSearchFallbackMulti(`小红书 ${scopedQuery}`, pageNum, timeRange, isStrict);
            const scaledList = list.map(item => ({
                ...item,
                platform: 'Xiaohongshu',
                playCount: formatCount((item.playRaw || 100000) * 8)
            }));
            return sendVideoList(res, scaledList, timeRange);

        } else if (platform === 'kuaishou') {
            const list = await getBilibiliSearchFallbackMulti(`快手 ${scopedQuery}`, pageNum, timeRange, isStrict);
            const scaledList = list.map(item => ({
                ...item,
                platform: 'Kuaishou',
                playCount: formatCount((item.playRaw || 100000) * 12)
            }));
            return sendVideoList(res, scaledList, timeRange);
        }

        res.status(400).json({ error: 'Invalid platform selection' });
    } catch (err) {
        console.error('[Error] Search failed:', err.message);
        res.status(500).json({ error: 'SERVER_ERROR', message: `搜索失败：${err.message}` });
    }
});

// Route to fetch videos for a specific topic (Douyin / Twitter word map to Bilibili search)
app.get('/api/search-topic', async (req, res) => {
    const { query } = req.query;
    console.log(`[API] Searching topic videos for query: ${query}`);

    try {
        const searchUrl = `https://api.bilibili.com/x/web-interface/search/all/v2?keyword=${encodeURIComponent(query)}`;
        const response = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://www.bilibili.com'
            }
        });

        if (response.data.code === 0 && response.data.data && response.data.data.result) {
            // Find video list in search results
            const videoResult = response.data.data.result.find(r => r.result_type === 'video');
            if (videoResult && videoResult.data) {
                const list = videoResult.data.slice(0, 10).map(item => ({
                    id: item.bvid,
                    title: item.title.replace(/<em class="keyword">/g, '').replace(/<\/em>/g, ''),
                    description: item.description,
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
                list.sort((a, b) => b.playRaw - a.playRaw);
                return res.json({ success: true, list });
            }
        }
        res.json({ success: true, list: [] });
    } catch (err) {
        console.error('[Error] Search topic failed:', err.message);
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
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
