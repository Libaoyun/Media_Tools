const axios = require('axios');
const fs = require('fs');

async function run() {
    const videoUrl = 'https://aweme.snssdk.com/aweme/v1/play/?video_id=v0d00fg10000d880fq7og65s5lbu48f0&ratio=720p';
    console.log('Downloading...', videoUrl);
    const downloadHeaders = {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
    };

    try {
        const res = await axios({
            method: 'GET',
            url: videoUrl,
            headers: downloadHeaders,
            responseType: 'arraybuffer',
            timeout: 10000 // 10s timeout
        });
        console.log('Status:', res.status);
        console.log('Headers:', res.headers);
        console.log('Byte Length:', res.data.byteLength);
    } catch (e) {
        console.error('Error:', e.message);
        if (e.response) {
            console.error('Response Status:', e.response.status);
            console.error('Response Headers:', e.response.headers);
        }
    }
}

run();
