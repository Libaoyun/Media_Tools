const axios = require('axios');

async function testBiliSubtitles(bvid) {
    console.log(`Checking Bilibili official subtitles for ${bvid}...`);
    try {
        const viewRes = await axios.get(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        const cid = viewRes.data?.data?.cid;
        const title = viewRes.data?.data?.title;
        console.log(`Title: ${title}, CID: ${cid}`);

        // Try player v2 API
        const p2Res = await axios.get(`https://api.bilibili.com/x/player/v2?bvid=${bvid}&cid=${cid}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        const subtitles = p2Res.data?.data?.subtitle?.subtitles || [];
        console.log(`Subtitles found: ${subtitles.length}`);
        if (subtitles.length > 0) {
            console.log('Subtitle track:', subtitles[0]);
            const subUrl = subtitles[0].subtitle_url.startsWith('http') ? subtitles[0].subtitle_url : 'https:' + subtitles[0].subtitle_url;
            const subJsonRes = await axios.get(subUrl);
            const lines = subJsonRes.data?.body || [];
            console.log(`Total spoken subtitle lines: ${lines.length}`);
            console.log('Sample spoken lines:', lines.slice(0, 5));
        }
    } catch (e) {
        console.log('Subtitle error:', e.message);
    }
}

async function main() {
    await testBiliSubtitles('BV1bW411n7fY');
    await testBiliSubtitles('BV1xx411c7mD');
    await testBiliSubtitles('BV1sV411h7mR');
    await testBiliSubtitles('BV1zJ411w7dW');
}

main();
