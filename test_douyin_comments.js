const axios = require('axios');

async function testDouyinComments() {
    const videoId = '7672333113179049256';
    console.log(`Testing real comments for videoId ${videoId}...`);
    try {
        const res = await axios.get(`https://www.iesdouyin.com/web/api/v2/comment/list/?aweme_id=${videoId}&count=20`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15',
                'Referer': 'https://www.douyin.com/'
            },
            timeout: 5000
        });
        console.log('Comments res status:', res.status);
        console.log('Comments count:', res.data?.comments?.length);
        if (res.data?.comments?.length > 0) {
            console.log('Sample comments:', res.data.comments.slice(0, 5).map(c => ({ text: c.text, digg: c.digg_count })));
        }
    } catch (e) {
        console.log('Comments error:', e.message);
    }
}

testDouyinComments();
