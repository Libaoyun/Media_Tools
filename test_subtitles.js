const axios = require('axios');

async function testDouyinSubtitles() {
    const videoId = '7672333113179049256';
    console.log(`Testing Douyin subtitle extraction for ${videoId}...`);
    try {
        const res = await axios.get(`https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids=${videoId}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15' },
            timeout: 5000
        });
        const item = res.data?.item_list?.[0];
        console.log('Video desc:', item?.desc);
        console.log('Video duration:', item?.duration);
        console.log('Subtitle infos:', item?.video?.subtitle_infos || item?.cha_list);
    } catch (e) {
        console.log('Douyin subtitle error:', e.message);
    }
}

async function testBiliSubtitles() {
    const bvid = 'BV1bW411n7fY';
    console.log(`\nTesting Bilibili subtitle extraction for ${bvid}...`);
    try {
        const viewRes = await axios.get(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`);
        const cid = viewRes.data?.data?.cid;
        const subRes = await axios.get(`https://api.bilibili.com/x/player/v2?bvid=${bvid}&cid=${cid}`);
        console.log('Bili subtitle list:', subRes.data?.data?.subtitle?.subtitles);
    } catch (e) {
        console.log('Bili subtitle error:', e.message);
    }
}

async function main() {
    await testDouyinSubtitles();
    await testBiliSubtitles();
}

main();
