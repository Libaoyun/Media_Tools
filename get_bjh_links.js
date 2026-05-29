const puppeteer = require('puppeteer');

async function main() {
    console.log('Searching Baidu News for live Baijiahao URLs...');
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    try {
        await page.goto('https://www.baidu.com/s?wd=site:baijiahao.baidu.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Extract links from Baidu Search Results
        const links = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a'))
                .map(a => a.href)
                .filter(href => href.includes('baidu.com/link?') || href.includes('baijiahao.baidu.com'));
        });
        
        console.log('Raw links count:', links.length);
        
        // Resolve a few links using Puppeteer or simply visit them
        const bjhUrls = [];
        for (const link of links.slice(0, 8)) {
            try {
                console.log('Resolving link:', link.substring(0, 100));
                const newPage = await browser.newPage();
                await newPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
                await newPage.goto(link, { waitUntil: 'domcontentloaded', timeout: 10000 });
                const currentUrl = newPage.url();
                console.log('-> Resolved to:', currentUrl);
                if (currentUrl.includes('baijiahao.baidu.com/s?id=')) {
                    bjhUrls.push(currentUrl);
                }
                await newPage.close();
            } catch (err) {
                console.log('Failed to resolve:', err.message);
            }
        }
        
        console.log('Resolved Baijiahao URLs:', bjhUrls);

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await browser.close();
    }
}

main();
