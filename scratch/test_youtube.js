const puppeteer = require('puppeteer');

(async () => {
    const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'; // Rickroll
    console.log(`Starting browser for YouTube URL: ${url}`);
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-web-security',
            '--autoplay-policy=no-user-gesture-required'
        ]
    });
    const page = await browser.newPage();
    
    // Set a mobile UA
    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1');
    
    await page.setRequestInterception(true);
    page.on('request', (request) => {
        const reqUrl = request.url();
        if (reqUrl.includes('googlevideo.com')) {
            console.log(`[googlevideo] Request: ${reqUrl.substring(0, 150)}...`);
            // Print some query parameters
            try {
                const parsed = new URL(reqUrl);
                const mime = parsed.searchParams.get('mime');
                const itag = parsed.searchParams.get('itag');
                console.log(`  -> MIME: ${mime}, itag: ${itag}`);
            } catch (e) {}
        }
        request.continue();
    });

    page.on('response', async (response) => {
        const reqUrl = response.url();
        if (reqUrl.includes('googlevideo.com')) {
            console.log(`[googlevideo] Response status: ${response.status()} for ${reqUrl.substring(0, 80)}`);
        }
    });

    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
        console.log(`Page navigated successfully`);
    } catch (e) {
        console.log(`Navigation error/timeout:`, e.message);
    }

    // Wait for 10 seconds to allow the player to load and start fetching video segments
    console.log("Waiting for player to start loading media...");
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Check if we can find video element or any global state
    const pageInfo = await page.evaluate(() => {
        const videoEl = document.querySelector('video');
        return {
            title: document.title,
            videoSrc: videoEl ? videoEl.src : null,
            videoHtml: videoEl ? videoEl.outerHTML : null
        };
    });

    console.log(`Page Info:`, pageInfo);

    await browser.close();
})();
