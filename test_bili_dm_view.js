const axios = require('axios');

async function testDmView(bvid) {
    console.log(`Checking dm view for ${bvid}...`);
    try {
        const viewRes = await axios.get(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        const cid = viewRes.data?.data?.cid;
        const dmRes = await axios.get(`https://api.bilibili.com/x/v2/dm/web/view?type=1&oid=${cid}&pid=${viewRes.data?.data?.aid}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Referer': 'https://www.bilibili.com' }
        });
        console.log('Dm view subtitle:', dmRes.data?.data?.subtitle);
    } catch (e) {
        console.log('Dm error:', e.message);
    }
}

testDmView('BV1bW411n7fY');
