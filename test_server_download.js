const axios = require('axios');

async function run() {
    const parseUrl = 'http://localhost:3000/api/parse';
    const targetVideo = 'https://www.bilibili.com/video/BV1GJ411x7h7/';
    
    console.log(`Parsing video: ${targetVideo} ...`);
    try {
        const parseRes = await axios.post(parseUrl, {
            url: targetVideo
        });
        
        console.log('Parse successful!');
        const data = parseRes.data;
        console.log(`Title: ${data.title}`);
        console.log(`Platform: ${data.platform}`);
        console.log(`Video URL (truncated): ${data.videoUrl.substring(0, 100)}...`);
        
        // Now call the download endpoint
        const downloadUrl = `http://localhost:3000/api/download`;
        console.log(`Calling download proxy: ${downloadUrl}`);
        
        const downloadRes = await axios.get(downloadUrl, {
            params: {
                videoUrl: data.videoUrl,
                referer: data.targetUrl,
                title: data.title
            },
            responseType: 'arraybuffer'
        });
        
        console.log(`Download response status: ${downloadRes.status}`);
        console.log(`Download response headers:`, downloadRes.headers);
        console.log(`Download body length (bytes): ${downloadRes.data.byteLength}`);
        
    } catch (e) {
        console.error('Error during test:', e.message);
        if (e.response) {
            console.error('Status:', e.response.status);
            console.error('Headers:', e.response.headers);
            const bodyStr = Buffer.from(e.response.data).toString('utf-8');
            console.error('Body (truncated):', bodyStr.substring(0, 500));
        }
    }
}

run();
