const axios = require('axios');

async function testBiliEndpoints() {
    const urls = [
        'https://api.bilibili.com/x/web-interface/ranking/region?rid=22&day=7',
        'https://api.bilibili.com/x/web-interface/ranking/v2?rid=0',
        'https://api.bilibili.com/x/web-interface/popular?ps=50&pn=1',
        'https://api.bilibili.com/x/web-interface/popular?ps=50&pn=2',
        'https://api.bilibili.com/x/web-interface/popular/precious?page_size=50&page=1',
        'https://api.bilibili.com/x/web-interface/popular/series/one?number=200'
    ];

    for (const url of urls) {
        try {
            const res = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                timeout: 5000
            });
            const list = res.data?.data?.list || res.data?.data;
            console.log(url, '-> status:', res.status, 'list length:', Array.isArray(list) ? list.length : typeof list);
        } catch (e) {
            console.log(url, '-> error:', e.message);
        }
    }
}

testBiliEndpoints();
