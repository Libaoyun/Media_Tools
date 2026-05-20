const axios = require('axios');

const bvid = 'BV1GJ411x7h7';

async function testSubApi() {
    try {
        const viewRes = await axios.get(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`);
        const data = viewRes.data.data;
        console.log('Subtitle data from API:', JSON.stringify(data.subtitle));
        
        if (data.subtitle && data.subtitle.list && data.subtitle.list.length > 0) {
            const subUrl = data.subtitle.list[0].subtitle_url;
            console.log('Found subtitle URL:', subUrl);
            const subRes = await axios.get(subUrl.startsWith('//') ? 'https:' + subUrl : subUrl);
            console.log('Subtitle Content sample:', JSON.stringify(subRes.data.body).substring(0, 300));
        }
    } catch (e) {
        console.error(e.message);
    }
}

testSubApi();
