const fs = require('fs');
const html = fs.readFileSync('douyin_dump.html', 'utf-8');

const idx = html.indexOf('_ROUTER_DATA');
console.log('Index of _ROUTER_DATA:', idx);
if (idx !== -1) {
    const chunk = html.substring(idx - 20, idx + 500);
    console.log('Chunk around _ROUTER_DATA:\n', chunk);
    
    // Find closing script tag
    const endScript = html.indexOf('</script>', idx);
    console.log('End script idx:', endScript);
    const statement = html.substring(idx, endScript);
    console.log('Statement length:', statement.length);
    console.log('Statement start:', statement.substring(0, 100));
    console.log('Statement end:', statement.substring(statement.length - 100));
    
    const equalIdx = statement.indexOf('=');
    const jsonStr = statement.substring(equalIdx + 1).trim();
    try {
        const data = JSON.parse(jsonStr);
        console.log('JSON parsed successfully!');
        fs.writeFileSync('douyin_router_full.json', JSON.stringify(data, null, 2), 'utf-8');
        
        // Find videoInfo
        for (const [key, val] of Object.entries(data.loaderData || {})) {
            console.log('Loader key:', key);
            if (val && typeof val === 'object') {
                if (val.videoInfoRes) {
                    const item = val.videoInfoRes.item_list?.[0];
                    console.log('Found video item:', {
                        desc: item?.desc,
                        nickname: item?.author?.nickname,
                        cover: item?.video?.cover?.url_list?.[0],
                        play_addr: item?.video?.play_addr?.url_list?.[0],
                        duration: item?.duration
                    });
                }
            }
        }
    } catch (e) {
        console.log('JSON parse error:', e.message);
    }
}
