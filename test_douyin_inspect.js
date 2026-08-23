const axios = require('axios');
const fs = require('fs');

async function inspectHtml() {
    const mobileUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';
    const res = await axios.get('https://v.douyin.com/E-4whck_rfQ/', {
        headers: {
            'User-Agent': mobileUA
        },
        maxRedirects: 10
    });

    const html = res.data;
    fs.writeFileSync('douyin_dump.html', html, 'utf-8');
    console.log('Saved douyin_dump.html, length:', html.length);

    // Look for video tags, JSON scripts, _ROUTER_DATA, item_list
    const routerMatch = html.match(/_ROUTER_DATA\s*=\s*({.+?});<\/script>/);
    if (routerMatch) {
        console.log('Found _ROUTER_DATA!');
        try {
            const data = JSON.parse(routerMatch[1]);
            console.log('Router data keys:', Object.keys(data));
            fs.writeFileSync('douyin_router.json', JSON.stringify(data, null, 2), 'utf-8');
        } catch (e) {
            console.log('JSON parse error:', e.message);
        }
    } else {
        console.log('No _ROUTER_DATA found, searching for other JSON blocks...');
        const scripts = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
        for (const s of scripts) {
            if (s.includes('playAddr') || s.includes('play_addr') || s.includes('video') || s.includes('desc')) {
                console.log('Found relevant script chunk:', s.substring(0, 300));
            }
        }
    }
}

inspectHtml();
