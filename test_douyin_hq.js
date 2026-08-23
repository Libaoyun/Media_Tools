const axios = require('axios');

async function testDouyinHq() {
    const videoId = '7672333113179049256';
    const res = await axios.get(`https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids=${videoId}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15' }
    });
    const item = res.data?.item_list?.[0];
    console.log('Item found:', Boolean(item));
    if (item) {
        const stream = item.video?.play_addr?.url_list?.[0]?.replace('playwm', 'play');
        console.log('HQ stream:', stream);
    }
}

testDouyinHq();
