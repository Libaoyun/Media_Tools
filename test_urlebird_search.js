const puppeteer = require('puppeteer');

async function test() {
    console.log('Launching browser...');
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-web-security',
            '--proxy-server=http://127.0.0.1:7897'
        ]
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    try {
        console.log('Searching Urlebird for "funny"...');
        await page.goto('https://urlebird.com/search/?q=funny', { waitUntil: 'domcontentloaded', timeout: 20000 });
        console.log('Title:', await page.title());
        
        const info = await page.evaluate(() => {
            const anchors = Array.from(document.querySelectorAll('a'));
            const videoLinks = anchors
                .map(a => a.href)
                .filter(href => href.includes('/video/'));
            return {
                videoLinksCount: videoLinks.length,
                videoLinks: videoLinks.slice(0, 5)
            };
        });
        console.log('Search results:', JSON.stringify(info, null, 2));
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await browser.close();
    }
}
test();
