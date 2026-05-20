const axios = require('axios');

const bvid = 'BV1rFg8zcEaN';

async function testDirectApi() {
    try {
        console.log(`Fetching view info for ${bvid}...`);
        const viewRes = await axios.get(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        
        if (viewRes.data.code !== 0) {
            console.error('Error fetching view info:', viewRes.data);
            return;
        }
        
        const { aid, cid, title, pic, desc } = viewRes.data.data;
        console.log(`Found Aid: ${aid}, Cid: ${cid}, Title: ${title}`);
        
        console.log(`Fetching playurl...`);
        const playRes = await axios.get(`https://api.bilibili.com/x/player/playurl?avid=${aid}&bvid=${bvid}&cid=${cid}&qn=80&fnval=0&fnver=0&fourk=1&otype=json`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://www.bilibili.com'
            }
        });
        
        console.log('Playurl Response:', JSON.stringify(playRes.data).substring(0, 800));
        
        if (playRes.data.code === 0 && playRes.data.data?.durl?.[0]?.url) {
            console.log('Successfully found direct MP4 URL:', playRes.data.data.durl[0].url);
        } else {
            console.log('Failed to find direct MP4 URL in playurl response.');
        }
    } catch (e) {
        console.error('API Error:', e.message);
    }
}

testDirectApi();
