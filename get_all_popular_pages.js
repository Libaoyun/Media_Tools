const axios = require('axios');
const fs = require('fs');

async function getAllPopular() {
    const allVideos = [];
    const seenBvids = new Set();

    // 1. Precious / Must-watch (入站必刷)
    try {
        const res = await axios.get('https://api.bilibili.com/x/web-interface/popular/precious?page_size=100&page=1', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            timeout: 6000
        });
        const list = res.data?.data?.list || [];
        for (const item of list) {
            if (item.bvid && !seenBvids.has(item.bvid)) {
                seenBvids.add(item.bvid);
                allVideos.push(formatItem(item));
            }
        }
        console.log(`Added ${list.length} precious videos.`);
    } catch (e) {
        console.log('Precious error:', e.message);
    }

    // 2. Ranking v2
    try {
        const res = await axios.get('https://api.bilibili.com/x/web-interface/ranking/v2?rid=0', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            timeout: 6000
        });
        const list = res.data?.data?.list || [];
        for (const item of list) {
            if (item.bvid && !seenBvids.has(item.bvid)) {
                seenBvids.add(item.bvid);
                allVideos.push(formatItem(item));
            }
        }
        console.log(`Added ${list.length} ranking v2 videos.`);
    } catch (e) {
        console.log('Ranking v2 error:', e.message);
    }

    // 3. Popular pages 1 to 10
    for (let pn = 1; pn <= 10; pn++) {
        try {
            const res = await axios.get(`https://api.bilibili.com/x/web-interface/popular?ps=50&pn=${pn}`, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                timeout: 6000
            });
            const list = res.data?.data?.list || [];
            let addedCount = 0;
            for (const item of list) {
                if (item.bvid && !seenBvids.has(item.bvid)) {
                    seenBvids.add(item.bvid);
                    allVideos.push(formatItem(item));
                    addedCount++;
                }
            }
            console.log(`Page ${pn}: added ${addedCount} videos.`);
            await new Promise(r => setTimeout(r, 300));
        } catch (e) {
            console.log(`Page ${pn} error:`, e.message);
        }
    }

    console.log(`Total unique verified active videos collected: ${allVideos.length}`);
    fs.writeFileSync('bilibili_full_pool.json', JSON.stringify(allVideos, null, 2));
}

function formatItem(item) {
    const rawPic = item.pic || '';
    const cleanPic = rawPic.startsWith('http') ? rawPic : (rawPic ? 'https:' + rawPic : '');
    const playNum = item.stat?.view || 10000000;
    const danmakuNum = item.stat?.danmaku || 1000;
    return {
        id: item.bvid,
        title: item.title.replace(/<[^>]+>/g, '').trim(),
        author: item.owner?.name || 'B站UP主',
        playRaw: playNum,
        playCount: playNum >= 10000 ? (playNum / 10000).toFixed(1) + '万' : String(playNum),
        commentCount: danmakuNum >= 10000 ? (danmakuNum / 10000).toFixed(1) + '万' : String(danmakuNum),
        cover: cleanPic,
        url: `https://www.bilibili.com/video/${item.bvid}`,
        duration: item.duration ? `${Math.floor(item.duration / 60)}:${(item.duration % 60).toString().padStart(2, '0')}` : '03:45',
        tname: item.tname || '',
        tid: item.tid || 0,
        desc: item.desc || '',
        pubdate: item.pubdate || Math.floor(Date.now() / 1000)
    };
}

getAllPopular();
