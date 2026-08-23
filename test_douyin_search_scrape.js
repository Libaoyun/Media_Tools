const puppeteer = require('puppeteer');

async function scrapeDouyinHotVideos() {
    console.log('Launching browser to scrape real Douyin hot videos...');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        let searchVideos = [];
        page.on('response', async (response) => {
            const url = response.url();
            if (url.includes('/aweme/v1/web/search/item/') || url.includes('/aweme/v1/web/general/search/single/')) {
                try {
                    const json = await response.json();
                    if (json?.data) {
                        for (const d of json.data) {
                            if (d?.aweme_info) searchVideos.push(d.aweme_info);
                        }
                    }
                } catch(e) {}
            }
        });

        await page.goto('https://www.douyin.com/search/%E6%90%9E%E7%AC%91', { waitUntil: 'domcontentloaded', timeout: 15000 });
        await new Promise(r => setTimeout(r, 4000));

        console.log('Intercepted search videos count:', searchVideos.length);
        if (searchVideos.length > 0) {
            console.log('Sample search video:', {
                aweme_id: searchVideos[0].aweme_id,
                desc: searchVideos[0].desc,
                author: searchVideos[0].author?.nickname,
                cover: searchVideos[0].video?.cover?.url_list?.[0],
                play_addr: searchVideos[0].video?.play_addr?.url_list?.[0]
            });
        }

        const domCards = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a[href*="/video/"]'));
            return links.map(a => ({
                href: a.href,
                id: a.href.match(/video\/(\d+)/)?.[1],
                text: a.innerText.trim()
            }));
        });
        console.log('DOM video links:', domCards.slice(0, 5));

    } catch (e) {
        console.log('Puppeteer error:', e.message);
    } finally {
        await browser.close();
    }
}

scrapeDouyinHotVideos();
