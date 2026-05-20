const axios = require('axios');

const bvid = 'BV1GJ411x7h7';

async function testV2() {
    try {
        const viewRes = await axios.get(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`);
        const { aid, cid } = viewRes.data.data;
        console.log(`Aid: ${aid}, Cid: ${cid}`);
        
        const v2Res = await axios.get(`https://api.bilibili.com/x/player/v2?cid=${cid}&aid=${aid}&bvid=${bvid}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://www.bilibili.com'
            }
        });
        
        console.log('V2 response subtitles:', JSON.stringify(v2Res.data.data?.subtitle));
    } catch (e) {
        console.error(e.message);
    }
}

testV2();
