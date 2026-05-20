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
    
    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1');
    
    page.on('response', async (response) => {
        const reqUrl = response.url();
        if (reqUrl.includes('googlevideo.com/videoplayback')) {
            console.log(`\nResponse Intercepted!`);
            console.log(`URL: ${reqUrl.substring(0, 120)}...`);
            console.log(`Status: ${response.status()}`);
            console.log(`Headers:`, JSON.stringify(response.headers(), null, 2));
        }
    });

    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        console.log(`Page navigated.`);
    } catch (e) {
        console.log(`Navigation error:`, e.message);
    }

    await new Promise(resolve => setTimeout(resolve, 8000));
    await browser.close();
})();
