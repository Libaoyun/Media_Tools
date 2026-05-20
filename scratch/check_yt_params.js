const puppeteer = require('puppeteer');

(async () => {
    const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-web-security'
        ]
    });
    const page = await browser.newPage();
    
    // Test with iPad User Agent
    await page.setUserAgent('Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1');
    
    await page.setRequestInterception(true);
    page.on('request', (request) => {
        const reqUrl = request.url();
        if (reqUrl.includes('googlevideo.com/videoplayback')) {
            console.log(`\n--- Intercepted URL ---`);
            console.log(`URL: ${reqUrl}`);
            try {
                const parsed = new URL(reqUrl);
                console.log(`SearchParams:`);
                for (const [key, val] of parsed.searchParams.entries()) {
                    console.log(`  ${key}: ${val}`);
                }
            } catch (e) {
                console.error(e);
            }
        }
        request.continue();
    });

    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        console.log(`Page loaded, waiting for video playback requests...`);
    } catch (e) {
        console.log(`Error:`, e.message);
    }

    await new Promise(resolve => setTimeout(resolve, 8000));
    await browser.close();
})();
