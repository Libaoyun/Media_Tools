const axios = require('axios');

async function testDouyin() {
    const rawText = `2.02 L@J.Vy Agb:/ :0pm 06/11 “谎言不会伤人、真像才是快刀！” # 兔娘# 婚姻# 彩礼# inmyfeelings# 创作者扶持计划  https://v.douyin.com/E-4whck_rfQ/ 复制此链接，打开Dou音搜索，直接观看视频！`;
    
    // Extract URL
    const urlMatch = rawText.match(/https?:\/\/[^\s]+/);
    if (!urlMatch) {
        console.log('No URL found');
        return;
    }
    let shortUrl = urlMatch[0];
    console.log('Found URL:', shortUrl);

    try {
        const mobileUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';
        const desktopUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

        // Method 1: Follow redirect with mobile UA
        const res = await axios.get(shortUrl, {
            headers: {
                'User-Agent': mobileUA
            },
            maxRedirects: 10,
            validateStatus: () => true
        });

        const finalUrl = res.request?.res?.responseUrl || res.config?.url || '';
        console.log('Final URL:', finalUrl);

        const html = typeof res.data === 'string' ? res.data : '';
        console.log('HTML length:', html.length);

        // Check for /video/(\d+)
        const match = finalUrl.match(/video\/(\d+)/) || html.match(/\/video\/(\d+)/) || html.match(/"aweme_id":"(\d+)"/) || html.match(/"itemId":"(\d+)"/);
        console.log('Video ID match:', match ? match[1] : null);

        // Also check desktop UA
        const dRes = await axios.get(shortUrl, {
            headers: {
                'User-Agent': desktopUA
            },
            maxRedirects: 10,
            validateStatus: () => true
        });
        const dFinalUrl = dRes.request?.res?.responseUrl || '';
        console.log('Desktop Final URL:', dFinalUrl);
        const dMatch = dFinalUrl.match(/video\/(\d+)/) || (typeof dRes.data === 'string' ? dRes.data.match(/video\/(\d+)/) : null);
        console.log('Desktop Video ID match:', dMatch ? dMatch[1] : null);

        const videoId = match?.[1] || dMatch?.[1];
        if (videoId) {
            console.log('Testing video detail fetch for videoId:', videoId);
            // Try iesdouyin API
            try {
                const apiRes = await axios.get(`https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids=${videoId}`, {
                    headers: { 'User-Agent': mobileUA }
                });
                console.log('IES API result:', JSON.stringify(apiRes.data).substring(0, 300));
            } catch (e) {
                console.log('IES API error:', e.message);
            }

            // Try official web detail API
            try {
                const webApiRes = await axios.get(`https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${videoId}`, {
                    headers: {
                        'User-Agent': desktopUA,
                        'Referer': `https://www.douyin.com/video/${videoId}`
                    }
                });
                console.log('Web Detail API result:', JSON.stringify(webApiRes.data).substring(0, 300));
            } catch (e) {
                console.log('Web Detail API error:', e.message);
            }
        }

    } catch (err) {
        console.error('Error during test:', err.message);
    }
}

testDouyin();
