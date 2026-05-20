const axios = require('axios');

// Intercepted URL from earlier test:
const interceptedUrl = 'https://api.bilibili.com/x/player/wbi/playurl?avid=114884788358568&bvid=BV1rFg8zcEaN&cid=31166104341&qn=0&fnver=0&fnval=4048&fourk=1&w_rid=70b6e0703f8f0788a36326d9edc8f31c&wts=1779252033';

async function testWbiToPlayurl() {
    try {
        const parsed = new URL(interceptedUrl);
        parsed.pathname = '/x/player/playurl';
        parsed.searchParams.set('fnval', '0');
        parsed.searchParams.set('qn', '80');
        parsed.searchParams.delete('w_rid');
        parsed.searchParams.delete('wts');
        
        console.log('Requesting rewritten URL:', parsed.toString());
        const res = await axios.get(parsed.toString(), {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://www.bilibili.com'
            }
        });
        
        console.log('Response code:', res.data.code);
        console.log('Response message:', res.data.message);
        if (res.data.code === 0 && res.data.data?.durl?.[0]?.url) {
            console.log('Success! Found MP4 URL:', res.data.data.durl[0].url.substring(0, 100) + '...');
        } else {
            console.log('Failed:', res.data);
        }
    } catch (e) {
        console.error(e.message);
    }
}

testWbiToPlayurl();
