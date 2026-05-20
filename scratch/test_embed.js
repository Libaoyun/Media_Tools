const puppeteer = require('puppeteer');

(async () => {
    const url = 'https://www.youtube.com/embed/dQw4w9WgXcQ';
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-web-security'
        ]
    });
    const page = await browser.newPage();
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    page.on('response', async (response) => {
        const reqUrl = response.url();
        if (reqUrl.includes('googlevideo.com/videoplayback')) {
            console.log(`Intercepted embed playback URL: ${reqUrl.substring(0, 150)}...`);
            try {
                const parsed = new URL(reqUrl);
                const mime = parsed.searchParams.get('mime');
                const itag = parsed.searchParams.get('itag');
                console.log(`  MIME: ${mime}, itag: ${itag}`);
            } catch (e) {}
        }
    });

    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        console.log(`Embed Page loaded.`);
    } catch (e) {
        console.log(`Error:`, e.message);
    }

    await new Promise(resolve => setTimeout(resolve, 8000));
    
    const pageInfo = await page.evaluate(() => {
        const videoEl = document.querySelector('video');
        return {
            title: document.title,
            videoSrc: videoEl ? videoEl.src : null,
            playinfo: window.ytInitialPlayerResponse ? true : false
        };
    });
    console.log(`Page Info:`, pageInfo);

    await browser.close();
})();
