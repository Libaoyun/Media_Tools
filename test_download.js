const axios = require('axios');

async function testBilibili() {
    const url = 'https://www.bilibili.com/video/BV1GJ411x7h7/';
    console.log(`Testing Bilibili direct parsing of ${url}...`);

    let bvid = 'BV1GJ411x7h7';
    const viewUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
    
    try {
        const viewRes = await axios.get(viewUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://www.bilibili.com'
            }
        });

        if (viewRes.data.code === 0 && viewRes.data.data) {
            const videoData = viewRes.data.data;
            const finalCid = videoData.cid;
            const finalAid = videoData.aid;
            const title = videoData.title;
            console.log(`Title: ${title}, cid: ${finalCid}, aid: ${finalAid}`);

            const playUrl = `https://api.bilibili.com/x/player/playurl?avid=${finalAid}&bvid=${bvid}&cid=${finalCid}&qn=80&fnval=0&fnver=0&fourk=1&otype=json`;
            const playRes = await axios.get(playUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': 'https://www.bilibili.com'
                }
            });

            if (playRes.data.code === 0 && playRes.data.data?.durl?.[0]?.url) {
                const videoSrc = playRes.data.data.durl[0].url;
                console.log(`Successfully obtained video URL: ${videoSrc}`);
                
                console.log('Downloading video using axios...');
                const downloadHeaders = {
                    'Referer': 'https://www.bilibili.com',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                };
                
                try {
                    const response = await axios({
                        method: 'GET',
                        url: videoSrc,
                        headers: downloadHeaders,
                        responseType: 'arraybuffer' // Use arraybuffer to get actual length easily
                    });
                    console.log(`Download response status: ${response.status}`);
                    console.log(`Download response length (bytes): ${response.data.byteLength}`);
                    console.log(`Response content-type: ${response.headers['content-type']}`);
                } catch (e) {
                    console.error(`Download failed:`, e.message);
                    if (e.response) {
                        console.error(`Status: ${e.response.status}`);
                        console.error(`Headers:`, e.response.headers);
                        const bodyString = Buffer.from(e.response.data).toString('utf-8');
                        console.error(`Data:`, bodyString.substring(0, 500));
                    }
                }
            } else {
                console.log('Failed to get play URL:', playRes.data);
            }
        } else {
            console.log('Failed to get view details:', viewRes.data);
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
}

testBilibili();
