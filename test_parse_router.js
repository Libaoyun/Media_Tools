const fs = require('fs');

const html = fs.readFileSync('douyin_dump.html', 'utf-8');
const match = html.match(/window\._ROUTER_DATA\s*=\s*([\s\S]+?);<\/script>/);

if (match) {
    console.log('Found window._ROUTER_DATA match!');
    const jsonStr = match[1];
    try {
        const data = JSON.parse(jsonStr);
        console.log('Parsed successfully!');
        fs.writeFileSync('douyin_router_full.json', JSON.stringify(data, null, 2), 'utf-8');
        
        // Find video details
        const pageData = data.loaderData?.['video_(id)/page'] || data.loaderData?.['video_(id)\u002Fpage'];
        console.log('pageData keys:', pageData ? Object.keys(pageData) : 'none');
        if (pageData?.videoInfoRes) {
            console.log('videoInfoRes keys:', Object.keys(pageData.videoInfoRes));
            const item = pageData.videoInfoRes.item_list?.[0];
            if (item) {
                console.log('Item Title:', item.desc);
                console.log('Item Author:', item.author?.nickname);
                console.log('Cover URL:', item.video?.cover?.url_list?.[0]);
                console.log('Play Addr URL List:', item.video?.play_addr?.url_list);
                console.log('Duration:', item.duration);
            }
        }
    } catch (e) {
        console.log('JSON Parse error:', e.message);
    }
} else {
    console.log('No match for window._ROUTER_DATA');
}
