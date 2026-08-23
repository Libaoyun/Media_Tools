const axios = require('axios');

async function testVideo() {
    const groupId = '7676710353711945002';
    console.log(`Testing video detail for group_id ${groupId}...`);
    try {
        const res = await axios.get(`https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids=${groupId}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15'
            },
            timeout: 5000
        });
        console.log('Item info status:', res.status, res.data);
    } catch (e) {
        console.log('Item info error:', e.message);
    }
}

testVideo();
