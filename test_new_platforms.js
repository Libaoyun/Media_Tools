const axios = require('axios');
const { spawn } = require('child_process');

async function main() {
    console.log('Starting server.js...');
    const server = spawn('node', ['server.js'], { stdio: 'inherit' });

    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Get a valid session token by logging in
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) {
        console.error('Error: Please set the ADMIN_PASSWORD environment variable to run this test.');
        server.kill();
        process.exit(1);
    }

    let token = '';
    try {
        console.log('Logging in to get authentication token...');
        const loginRes = await axios.post('http://localhost:3000/api/auth/login', {
            username: 'mediaAdmin',
            password: adminPassword
        });
        token = loginRes.data.token;
        console.log('Login successful! Token:', token);
    } catch (err) {
        console.error('Login failed:', err.message);
        server.kill();
        process.exit(1);
    }

    const testUrls = [
        // Bilibili
        { name: 'Bilibili', url: 'https://www.bilibili.com/video/BV1GJ411x7h7/' },
        // Xiaohongshu (Live Note URL with token)
        { name: 'Xiaohongshu', url: 'https://www.xiaohongshu.com/explore/640c142500000000130378e7?xsec_token=ABGOoORSRQAuf01FwPFS9pos0tU4O13J2-wRcVFd5xExc=&xsec_source=' },
        // Baijiahao (Live Article URL)
        { name: 'Baijiahao', url: 'https://baijiahao.baidu.com/s?id=1866505002753333560' },
        // Douyin (Direct CDN Download Verification)
        { name: 'Douyin', url: 'https://aweme.snssdk.com/aweme/v1/play/?video_id=v0d00fg10000d880fq7og65s5lbu48f0&ratio=720p', isDirectDownloadOnly: true }
    ];

    for (const test of testUrls) {
        console.log(`\n--- Testing platform: ${test.name} ---`);
        try {
            if (test.isDirectDownloadOnly) {
                console.log(`Testing direct proxy download for ${test.name}...`);
                const downloadRes = await axios.get('http://localhost:3000/api/download', {
                    params: {
                        videoUrl: test.url,
                        referer: '',
                        title: 'test_direct_download',
                        token: token
                    },
                    responseType: 'arraybuffer'
                });
                console.log(`Download response status: ${downloadRes.status}`);
                console.log(`Download response content-type: ${downloadRes.headers['content-type']}`);
                console.log(`Download response length (bytes): ${downloadRes.data.byteLength}`);
            } else {
                const res = await axios.post('http://localhost:3000/api/parse', {
                    url: test.url,
                    token: token
                });
                console.log(`Parse success for ${test.name}!`);
                console.log('Title:', res.data.title);
                console.log('Platform:', res.data.platform);
                console.log('Video URL (truncated):', res.data.videoUrl ? res.data.videoUrl.substring(0, 100) + '...' : 'NONE');
                console.log('Description (truncated):', res.data.description ? res.data.description.substring(0, 100) + '...' : 'NONE');

                if (res.data.videoUrl) {
                    console.log(`Testing download for ${test.name}...`);
                    const downloadRes = await axios.get('http://localhost:3000/api/download', {
                        params: {
                            videoUrl: res.data.videoUrl,
                            referer: res.data.targetUrl || test.url,
                            title: res.data.title,
                            token: token
                        },
                        responseType: 'arraybuffer'
                    });
                    console.log(`Download response status: ${downloadRes.status}`);
                    console.log(`Download response content-type: ${downloadRes.headers['content-type']}`);
                    console.log(`Download response length (bytes): ${downloadRes.data.byteLength}`);
                }
            }
        } catch (err) {
            console.error(`Parse failed for ${test.name}:`, err.message);
            if (err.response) {
                console.error('Error status:', err.response.status);
                let bodyStr = '';
                if (err.response.data instanceof Buffer) {
                    bodyStr = err.response.data.toString('utf-8');
                } else if (typeof err.response.data === 'object') {
                    bodyStr = JSON.stringify(err.response.data);
                } else {
                    bodyStr = String(err.response.data);
                }
                console.error('Error body:', bodyStr.substring(0, 500));
            }
        }
    }

    console.log('\nShutting down server.js...');
    server.kill();
}

main();
