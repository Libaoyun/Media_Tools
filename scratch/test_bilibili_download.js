const axios = require('axios');
const fs = require('fs');
const path = require('path');

const bvid = 'BV1rFg8zcEaN';

async function testDownload() {
    try {
        console.log(`1. Fetching playurl...`);
        const viewRes = await axios.get(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`);
        const { aid, cid } = viewRes.data.data;
        const playRes = await axios.get(`https://api.bilibili.com/x/player/playurl?avid=${aid}&bvid=${bvid}&cid=${cid}&qn=80&fnval=0&fnver=0&fourk=1&otype=json`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://www.bilibili.com'
            }
        });
        
        const videoUrl = playRes.data.data.durl[0].url;
        console.log(`2. Sending download request to local proxy...`);
        const response = await axios({
            method: 'GET',
            url: `http://localhost:3000/api/download?videoUrl=${encodeURIComponent(videoUrl)}&referer=https://www.bilibili.com/video/${bvid}/&title=test_bili`,
            responseType: 'stream'
        });
        
        console.log('Status:', response.status);
        console.log('Headers:', response.headers);
        
        const dest = fs.createWriteStream(path.join(__dirname, 'test_bili_output.mp4'));
        response.data.pipe(dest);
        
        await new Promise((resolve, reject) => {
            dest.on('finish', resolve);
            dest.on('error', reject);
            setTimeout(() => {
                response.data.destroy();
                dest.end();
                resolve();
            }, 3000);
        });
        console.log('Download test finished.');
    } catch (e) {
        console.error('Download error:', e.message);
        if (e.response) {
            console.error('Status code:', e.response.status);
        }
    }
}

testDownload();
