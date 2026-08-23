const axios = require('axios');
const puppeteer = require('puppeteer');

async function testDouyinApi() {
    console.log('Testing Douyin hot search API...');
    try {
        const res = await axios.get('https://aweme.snssdk.com/aweme/v1/hot/search/list/', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
                'Referer': 'https://www.douyin.com/'
            },
            timeout: 5000
        });
        console.log('API Status:', res.status);
        console.log('Word list count:', res.data?.data?.word_list?.length);
        if (res.data?.data?.word_list?.length > 0) {
            console.log('Sample words:', res.data.data.word_list.slice(0, 5).map(w => ({ word: w.word, hot_value: w.hot_value })));
        }
    } catch (e) {
        console.log('API error:', e.message);
    }
}

async function testDouyinPuppeteer() {
    console.log('\nTesting Douyin Puppeteer Scraper...');
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        
        let hotListData = [];
        page.on('response', async (response) => {
            const url = response.url();
            if (url.includes('/aweme/v1/web/hot/search/list/') || url.includes('/billboard/total/')) {
                try {
                    const json = await response.json();
                    if (json?.data?.word_list) hotListData = json.data.word_list;
                } catch(e) {}
            }
        });

        await page.goto('https://www.douyin.com/hot', { waitUntil: 'domcontentloaded', timeout: 15000 });
        await new Promise(r => setTimeout(r, 4000));

        const scraped = await page.evaluate(() => {
            const items = Array.from(document.querySelectorAll('[data-e2e="hot-board-item"], .ranking-item, li a[href*="/hot/"]'));
            return items.map(el => ({
                text: el.innerText.trim(),
                href: el.getAttribute('href')
            }));
        });
        console.log('Scraped DOM items:', scraped.slice(0, 5));
        console.log('Intercepted API words count:', hotListData.length);
    } catch (e) {
        console.log('Puppeteer error:', e.message);
    } finally {
        if (browser) await browser.close();
    }
}

async function main() {
    await testDouyinApi();
    await testDouyinPuppeteer();
}

main();
