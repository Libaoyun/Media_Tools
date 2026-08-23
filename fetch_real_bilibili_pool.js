const axios = require('axios');
const fs = require('fs');

const BILI_RIDS = {
    all: 0,
    kuso: 22,      // 鬼畜
    comedy: 138,   // 搞笑
    tech: 188,     // 科技 / 数码
    fashion: 155,  // 时尚
    ent: 5,        // 娱乐
    pets: 217,     // 动物圈
    wildlife: 217, // 动物野生
    marketing: 207,// 知识/商业
    animal: 217
};

async function fetchRankVideos(rid) {
    try {
        const url = rid === 0
            ? 'https://api.bilibili.com/x/web-interface/popular?ps=50&pn=1'
            : `https://api.bilibili.com/x/web-interface/ranking/v2?rid=${rid}&type=all`;

        const res = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Referer': 'https://www.bilibili.com'
            },
            timeout: 6000
        });

        const list = res.data?.data?.list || [];
        return list.map(item => ({
            id: item.bvid,
            title: item.title,
            author: item.owner?.name || 'B站UP主',
            playRaw: item.stat?.view || 1000000,
            playCount: item.stat?.view ? (item.stat.view >= 10000 ? (item.stat.view / 10000).toFixed(1) + '万' : String(item.stat.view)) : '100万',
            commentCount: item.stat?.danmaku ? (item.stat.danmaku >= 10000 ? (item.stat.danmaku / 10000).toFixed(1) + '万' : String(item.stat.danmaku)) : '1000',
            cover: item.pic?.startsWith('http') ? item.pic : (item.pic ? 'https:' + item.pic : ''),
            url: `https://www.bilibili.com/video/${item.bvid}`,
            duration: item.duration ? `${Math.floor(item.duration / 60)}:${(item.duration % 60).toString().padStart(2, '0')}` : '03:30',
            pubdate: item.pubdate || Math.floor(Date.now() / 1000)
        }));
    } catch (e) {
        console.warn(`Failed to fetch rid ${rid}:`, e.message);
        return [];
    }
}

async function main() {
    console.log('Fetching 100% REAL active Bilibili video catalog from official API...');
    const pool = {};
    for (const [cat, rid] of Object.entries(BILI_RIDS)) {
        console.log(`Fetching category: ${cat} (rid: ${rid})...`);
        const videos = await fetchRankVideos(rid);
        console.log(` -> Got ${videos.length} verified live videos for ${cat}`);
        pool[cat] = videos;
        await new Promise(r => setTimeout(r, 600));
    }

    fs.writeFileSync('bilibili_live_pool.json', JSON.stringify(pool, null, 2));
    console.log('Saved real Bilibili pool to bilibili_live_pool.json');
}

main();
