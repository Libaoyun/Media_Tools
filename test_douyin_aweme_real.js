const axios = require('axios');

async function testDouyinRealAweme() {
    console.log('Testing Douyin Billboard Aweme List...');
    try {
        const res = await axios.get('https://www.iesdouyin.com/web/api/v2/hotsearch/billboard/aweme/', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15',
                'Referer': 'https://www.douyin.com/'
            },
            timeout: 5000
        });
        console.log('Billboard Aweme status:', res.status);
        console.log('Aweme list count:', res.data?.aweme_list?.length);
        if (res.data?.aweme_list?.length > 0) {
            const first = res.data.aweme_list[0];
            console.log('Sample aweme:', {
                aweme_id: first.aweme_id,
                desc: first.desc,
                author: first.author?.nickname,
                cover: first.video?.cover?.url_list?.[0],
                play_addr: first.video?.play_addr?.url_list?.[0],
                share_url: first.share_url
            });
        }
    } catch (e) {
        console.log('Billboard error:', e.message);
    }
}

async function testDouyinSearchItem() {
    console.log('\nTesting Douyin Hot Search Video List API...');
    try {
        const res = await axios.get('https://aweme.snssdk.com/aweme/v1/hot/search/video/list/', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15',
                'Referer': 'https://www.douyin.com/'
            },
            timeout: 5000
        });
        console.log('Hot search video list status:', res.status, 'count:', res.data?.aweme_list?.length);
    } catch (e) {
        console.log('Hot search video list error:', e.message);
    }
}

async function main() {
    await testDouyinRealAweme();
    await testDouyinSearchItem();
}

main();
