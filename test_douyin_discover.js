const puppeteer = require('puppeteer');

async function scrapeDouyinDiscover() {
    console.log('Launching browser to check Douyin Discover & Hot pages...');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        let awemeList = [];
        page.on('response', async (response) => {
            const url = response.url();
            if (url.includes('/aweme/v1/web/tab/feed/') || url.includes('/aweme/v1/web/discover/feed/') || url.includes('/aweme/v1/web/hot/search/list/')) {
                try {
                    const json = await response.json();
                    if (json?.aweme_list) awemeList.push(...json.aweme_list);
                    if (json?.data?.word_list) {
                        console.log('Got hot word list count:', json.data.word_list.length);
                    }
                } catch(e) {}
            }
        });

        await page.goto('https://www.douyin.com/discover', { waitUntil: 'domcontentloaded', timeout: 15000 });
        await new Promise(r => setTimeout(r, 4000));

        console.log('Intercepted discover aweme count:', awemeList.length);
        if (awemeList.length > 0) {
            console.log('Sample discover aweme:', {
                aweme_id: awemeList[0].aweme_id,
                desc: awemeList[0].desc,
                author: awemeList[0].author?.nickname,
                cover: awemeList[0].video?.cover?.url_list?.[0],
                play_addr: awemeList[0].video?.play_addr?.url_list?.[0]
            });
        }
    } catch (e) {
        console.log('Error:', e.message);
    } finally {
        await browser.close();
    }
}

scrapeDouyinDiscover();
