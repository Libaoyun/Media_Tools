const axios = require('axios');

async function testBiliPlayurl() {
    const bvid = 'BV1bW411n7fY';
    const viewRes = await axios.get(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    const cid = viewRes.data?.data?.cid;
    const playRes = await axios.get(`https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=80&fnval=0`, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://www.bilibili.com'
        }
    });
    console.log('Playurl quality:', playRes.data?.data?.quality);
    console.log('Available formats:', playRes.data?.data?.accept_description);
    console.log('Stream URL length:', playRes.data?.data?.durl?.[0]?.url?.length);
    console.log('Video size bytes:', playRes.data?.data?.durl?.[0]?.size);
}

testBiliPlayurl();
