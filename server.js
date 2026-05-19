const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const axios = require('axios');

const app = express();
app.use(cors()); // 允许前端页面跨域访问我们自己的服务
app.use(express.json());

// 启发式 AI 本地智能总结引擎
function generateAISummary(title, desc, platform) {
    const text = ((title || '') + ' ' + (desc || '')).toLowerCase();

    // 1. 智能判别视频所属领域
    let category = "生活娱乐 & 综合创作";
    if (text.includes("code") || text.includes("编程") || text.includes("开发") || text.includes("ai") || text.includes("人工智能") || text.includes("gpt") || text.includes("科技") || text.includes("大模型")) {
        category = "科技前沿 & 编程技术";
    } else if (text.includes("mv") || text.includes("音乐") || text.includes("歌") || text.includes("music") || text.includes("concert") || text.includes("声乐")) {
        category = "音乐艺术 & 视听盛宴";
    } else if (text.includes("教程") || text.includes("怎么") || text.includes("如何") || text.includes("tutorial") || text.includes("learn") || text.includes("科普") || text.includes("知识")) {
        category = "知识科普 & 技能教程";
    } else if (text.includes("美食") || text.includes("吃") || text.includes("探店") || text.includes("cooking") || text.includes("food") || text.includes("做菜")) {
        category = "美食分享 & 探店推荐";
    } else if (text.includes("搞笑") || text.includes("哈哈") || text.includes("段子") || text.includes("funny") || text.includes("整蛊")) {
        category = "趣味幽默 & 解压娱乐";
    } else if (text.includes("穿搭") || text.includes("美妆") || text.includes("时尚") || text.includes("ootd") || text.includes("护肤")) {
        category = "时尚美妆 & 潮流生活";
    }

    // 2. 启发式提炼核心看点
    const points = [];
    if (category === "科技前沿 & 编程技术") {
        points.push("系统剖析了前沿科技/编程的核心逻辑，展示了现代技术栈的生产力工具组合。");
        points.push("重点阐述了自动化与智能化在解决实际痛点时的显著优势与降本增效成果。");
        points.push("提供了极具实操性的架构思路，适合开发者、极客及技术爱好者参考学习。");
    } else if (category === "音乐艺术 & 视听盛宴") {
        points.push("这是一部极具艺术感染力的视听作品，节奏感极强，画面与声轨质感出众。");
        points.push("人声与背景器乐完美交融，传递了强烈的情感张力与深层的意境共鸣。");
        points.push("在视听细节设计上极具心思，每一次起伏都扣人心弦，属于高品质的视听推荐。");
    } else if (category === "知识科普 & 技能教程") {
        points.push("本视频以浅显易懂的方式拆解了复杂的硬核知识，极大降低了大众的学习门槛。");
        points.push("详细演示了具体实操步骤与关键细节，是干货满满的高价值技能教程。");
        points.push("总结了常见痛点与防坑指南，帮助观众在短时间内掌握核心要领。");
    } else if (category === "美食分享 & 探店推荐") {
        points.push("沉浸式展示了令人食指大动的美食制作/测评过程，极富视觉诱惑力与生活烟火气。");
        points.push("详尽拆解了独家秘方、火候掌控或探店地标的性价比与核心招牌特色。");
        points.push("融合了独特的饮食文化与人文关怀，传递出治愈系的美食生活美学。");
    } else if (category === "时尚美妆 & 潮流生活") {
        points.push("紧跟当下潮流趋势，提供了极具个人特色与审美在线的视觉美学范式。");
        points.push("细节剖析了材质搭配、色系选择或美妆手法，干货与实操性极强。");
        points.push("旨在提升观众的审美穿搭水平与生活品质，充满积极自信的情绪感染力。");
    } else {
        points.push("系统还原了视频的核心脉络，内容节奏紧凑，极富感染力与趣味性。");
        points.push("抓取了时下最受关注的社会共鸣点/生活记录，直击年轻一代受众的心灵。");
        points.push("提供了极高情绪价值，内容结构巧妙，结尾处引人深思或留下深刻回味。");
    }

    // 3. 智能行动建议
    let suggestion = "建议收藏并结合原网页进行高频反复观看，内容实践度极高。";
    if (category === "科技前沿 & 编程技术") {
        suggestion = "强烈推荐技术开发人员和AI探索者收藏，可结合代码仓库进行本地复现实战。";
    } else if (category === "音乐艺术 & 视听盛宴") {
        suggestion = "建议佩戴高品质耳机，在安静环境下沉浸式倾听，感受无损品质的视听冲击。";
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
app.post('/api/parse', async (req, res) => {
    let { url, apiKey, endpointId } = req.body;
    if (!url) return res.status(400).json({ error: '请提供视频链接' });

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
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

        if (isBilibili) {
            // 使用 iPad UA，既不会像手机端那样被强制唤起 Bilibili App，又不会像 PC 端那样默认采用音视频分离的 DASH 流，而是直接返回完整的 MP4 直链！
            await page.setUserAgent('Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1');
        } else {
            // 抖音、小红书、TikTok 等其它平台使用手机 UA 触发轻量版/触屏版
            await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1');
        }

        let videoSrc = null;
        let description = '';

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
                } catch (e) {}
            }

            if (reqUrl.includes('/x/player/wbi/playurl') || reqUrl.includes('/x/player/playurl')) {
                try {
                    const parsedUrl = new URL(reqUrl);
                    parsedUrl.searchParams.set('fnval', '0'); // fnval=0 代表强制返回 MP4 直链，而不是音视频分离 of DASH (fnval=80/4048)
                    parsedUrl.searchParams.set('qn', '80');    // qn=80 强制向B站索要 1080p 最高清晰度（游客最高可自动下发 720p/480p，避免默认的 360p 渣画质）
                    request.continue({ url: parsedUrl.toString() });
                    console.log(`[拦截请求] 成功篡改B站播放接口参数为 MP4 格式并锁定最高画质 (fnval=0, qn=80)`);
                    return;
                } catch (e) { }
            }
            request.continue();
        });

        // 监听底层网络请求，暴力拦截媒体流及接口数据作为兜底
        page.on('response', async (response) => {
            if (videoSrc) return;
            const reqUrl = response.url();

            // 1. 拦截抖音 API
            if (reqUrl.includes('/aweme/v1/web/aweme/detail/') || reqUrl.includes('/aweme/v1/web/aweme/post/')) {
                try {
                    const json = await response.json();
                    if (json?.aweme_detail?.video?.play_addr?.url_list?.[0]) {
                        videoSrc = json.aweme_detail.video.play_addr.url_list[0];
                        description = json.aweme_detail.desc || '';
                        console.log(`[嗅探成功] 拦截到抖音API直链，文案长度: ${description.length}`);
                        if (resolveIntercept) resolveIntercept();
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

            // 3. 匹配常规的视频流后缀或 Content-Type (作为 Fallback)
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
        }

        // ⚡ 极客核心突破：B站 CC/AI 语音转文字字幕实时提取！
        let transcript = '';
        if (isBilibili) {
            try {
                const subtitleInfo = await page.evaluate(() => {
                    if (window.__INITIAL_STATE__ && window.__INITIAL_STATE__.videoData && window.__INITIAL_STATE__.videoData.subtitle) {
                        return window.__INITIAL_STATE__.videoData.subtitle.list;
                    }
                    return null;
                });

                if (subtitleInfo && subtitleInfo.length > 0) {
                    const subUrl = subtitleInfo[0].subtitle_url;
                    if (subUrl) {
                        const cleanSubUrl = subUrl.startsWith('//') ? 'https:' + subUrl : subUrl;
                        console.log(`[字幕提取] 检测到B站AI语音字幕，正在启动浏览器内部抓取: ${cleanSubUrl}`);

                        // 在 Puppeteer 页面环境内部发起 fetch 请求以避开所有 CORS 与鉴权限制
                        const subContent = await page.evaluate(async (url) => {
                            const res = await fetch(url);
                            const json = await res.json();
                            return json.body.map(item => item.content).join(' ');
                        }, cleanSubUrl);

                        if (subContent) {
                            transcript = subContent;
                            console.log(`[字幕提取] 成功抓取B站整段视频 AI 语音字幕，字数: ${transcript.length}`);
                        }
                    }
                }
            } catch (e) {
                console.log("[字幕提取] 抓取B站AI字幕失败:", e.message);
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
                        const strData = JSON.stringify(window._ROUTER_DATA);
                        const match = strData.match(/(https?:\/\/[^\"]*(?:douyinvod|video\/tos)[^\"]*)/);
                        if (match) return match[1];
                    }
                } catch (e) { }

                // 通用 video 标签兜底
                const videoEl = document.querySelector('video');
                if (videoEl && videoEl.src && !videoEl.src.startsWith('blob:')) {
                    return videoEl.src;
                }
                // 尝试找 source 标签
                const sourceEl = document.querySelector('video source');
                if (sourceEl && sourceEl.src) {
                    return sourceEl.src;
                }

                // 实在没有，看看页面里有没有直接暴露的带 video/tos 或 douyinvod 的链接
                const htmlMatch = document.body.innerHTML.match(/(https?:\/\/[^\"]*(?:douyinvod|video\/tos)[^\"]*)/);
                if (htmlMatch) {
                    return htmlMatch[1].replace(/\\u002F/g, '/');
                }

                return null;
            });
        }

        await browser.close();

        // 统一做链接修正（例如无协议头的链接补全）
        if (videoSrc && videoSrc.startsWith('//')) {
            videoSrc = 'https:' + videoSrc;
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
                } catch(e) {}
            }
        }

        // 封面图协议补全
        if (cover && cover.startsWith('//')) {
            cover = 'https:' + cover;
        }

        if (videoSrc) {
            // 绝不截断原始文案，如果抓取到了语音字幕，则文案直接设为完整原文字幕
            let rawExtractText = transcript || description;

            // 净化空白字符，但保留完整段落和换行以维持可读性
            rawExtractText = rawExtractText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

            // 豆包 API 深度接入 (仅用于提炼核心看点，不对原文字幕进行破坏性修改)
            let aiSummary = null;
            const effectiveApiKey = apiKey || '';
            // 支持在后端配置默认的 Endpoint ID，如果前端为空则使用默认 (请在下方将 'ep-xxxxxx' 替换为你火山控制台真实的接入点 ID)
            const effectiveEndpointId = endpointId || '';

            if (effectiveApiKey && effectiveEndpointId) {
                if (effectiveEndpointId.includes('xxxxx')) {
                    console.log(`[豆包 AI] ⚠️ 警告: 尚未配置接入点(Endpoint ID)。大模型调用被跳过，请前往火山控制台部署模型并获取 ep- 开头的接入点 ID！`);
                } else {
                    try {
                        console.log(`[豆包 AI] 正在通过豆包大模型对提取的真实文案进行核心要点提炼... (接入点: ${effectiveEndpointId})`);
                        const systemPrompt = `你是一个视频内容金牌提炼与总结大师。请根据我提供的视频标题、文案内容/字幕文本，完成以下任务，并以JSON格式返回。
                    
任务：
1. 分析视频所属的核心行业分类(category)。
2. 精炼出3个深入、有高度价值 of 视频核心看点(points)。
3. 提供一条具有前瞻性和极强操作性的智能建议(suggestion)。

注意：请仅返回一个合法的 JSON 对象，不要包含 markdown 格式标记(如 \`\`\`json)，属性名必须为: "category", "points", "suggestion"。整个JSON需要能够通过JSON.parse完美解析。`;

                        const userPrompt = `视频标题: ${title}
视频原始描述/字幕: ${rawExtractText.substring(0, 3000)} // 截取前3000字防 token 超限
视频所属平台: ${platform}`;

                        const doubaoRes = await axios.post('https://ark.cn-beijing.volces.com/api/v3/chat/completions', {
                            model: effectiveEndpointId,
                            messages: [
                                { role: 'system', content: systemPrompt },
                                { role: 'user', content: userPrompt }
                            ],
                            response_format: { type: "json_object" }
                        }, {
                            headers: {
                                'Authorization': `Bearer ${effectiveApiKey}`,
                                'Content-Type': 'application/json'
                            },
                            timeout: 25000
                        });

                        const reply = doubaoRes.data?.choices?.[0]?.message?.content;
                        if (reply) {
                            const parsedReply = JSON.parse(reply);
                            if (parsedReply.category && parsedReply.points && parsedReply.suggestion) {
                                aiSummary = {
                                    category: parsedReply.category,
                                    points: parsedReply.points,
                                    suggestion: parsedReply.suggestion,
                                    isRealAI: true
                                };
                                console.log(`[豆包 AI] 深度视频要点提炼成功！`);
                            }
                        }
                    } catch (e) {
                        console.error("[豆包 AI] 接口调用发生错误，安全降级为本地引擎:", e.message);
                    }
                }
            }

            // 如果没有接入豆包或豆包失败，使用本地启发式总结
                if (!aiSummary) {
                    aiSummary = generateAISummary(title, rawExtractText, platform);
                    aiSummary.isRealAI = false;
                }

                res.json({
                    success: true,
                    videoUrl: videoSrc,
                    targetUrl: url,
                    title: title,
                    cover: cover,
                    platform: platform,
                    description: rawExtractText || '暂无详细描述文案',
                    aiSummary: aiSummary
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

// 核心代理技术：无视大厂防盗链，直接流式透传下载给前端
app.get('/api/download', async (req, res) => {
    const { videoUrl, referer, title } = req.query;
    if (!videoUrl) return res.status(400).send('缺少视频地址');

    try {
        // 根据平台定制请求头
        let downloadHeaders = {
            'Referer': referer || 'https://www.bilibili.com',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        };

        // 抖音无水印链接重定向时，Referer 必须为空，且模拟手机端 User-Agent 以免被鉴权拦截
        if (videoUrl.includes('aweme/v1/play') || videoUrl.includes('douyinvod.com')) {
            downloadHeaders = {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
            };
        }

        // 使用后端发起请求，彻底绕过前端浏览器的 CORS 限制
        const response = await axios({
            method: 'GET',
            url: videoUrl,
            responseType: 'stream',
            headers: downloadHeaders
        });

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
const path = require('path');
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