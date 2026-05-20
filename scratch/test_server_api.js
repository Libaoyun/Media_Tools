const axios = require('axios');

async function runTests() {
    // 1. Test Bilibili (Should not require key)
    const biliUrl = '【“那个男人似乎永远都是顶流”】 https://www.bilibili.com/video/BV1rFg8zcEaN/?share_source=copy_web&vd_source=41fceef392c312ffdad2e38689bb8792';
    console.log('--- TEST 1: Bilibili extraction (no key sent) ---');
    try {
        const biliRes = await axios.post('http://localhost:3000/api/parse', { url: biliUrl });
        console.log('Bilibili Parse Success! (Unrestricted)');
        console.log('Platform:', biliRes.data.platform);
        console.log('Title:', biliRes.data.title);
    } catch (e) {
        console.error('Bilibili Parse Failed:', e.response?.status, e.response?.data || e.message);
    }

    // 2. Test YouTube with no key (Should fail)
    const ytUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    console.log('\n--- TEST 2: YouTube extraction (no key sent) ---');
    try {
        const ytRes = await axios.post('http://localhost:3000/api/parse', { url: ytUrl });
        console.log('YouTube Parse Success! (Unexpected)');
    } catch (e) {
        console.log('YouTube Parse Failed (Expected):', e.response?.status, e.response?.data);
    }

    // 3. Test YouTube with wrong key (Should fail)
    console.log('\n--- TEST 3: YouTube extraction (wrong key sent) ---');
    try {
        const ytRes = await axios.post('http://localhost:3000/api/parse', { url: ytUrl, accessKey: 'wrong_key' });
        console.log('YouTube Parse Success! (Unexpected)');
    } catch (e) {
        console.log('YouTube Parse Failed (Expected):', e.response?.status, e.response?.data);
    }

    // 4. Test YouTube with correct key (Should succeed)
    console.log('\n--- TEST 4: YouTube extraction (correct key sent) ---');
    try {
        const ytRes = await axios.post('http://localhost:3000/api/parse', { url: ytUrl, accessKey: '1qaz789' });
        console.log('YouTube Parse Success!');
        console.log('Platform:', ytRes.data.platform);
        console.log('Title:', ytRes.data.title);
        console.log('Video URL:', ytRes.data.videoUrl.substring(0, 100) + '...');
    } catch (e) {
        console.error('YouTube Parse Failed:', e.response?.status, e.response?.data || e.message);
    }
}

runTests();
