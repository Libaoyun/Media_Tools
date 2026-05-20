const puppeteer = require('puppeteer');

(async () => {
    const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    console.log(`Launching browser with MSE disabled...`);
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-web-security'
        ]
    });
    const page = await browser.newPage();
    
    // Set a mobile UA
    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1');
    
    // Disable MediaSource Extensions
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(window, 'MediaSource', {
            get: () => undefined,
            configurable: true
        });
        Object.defineProperty(window, 'WebKitMediaSource', {
            get: () => undefined,
            configurable: true
        });
    });

    let videoSrc = null;
    await page.setRequestInterception(true);
    page.on('request', (request) => {
        const reqUrl = request.url();
        if (reqUrl.includes('googlevideo.com/videoplayback')) {
            console.log(`Intercepted googlevideo URL: ${reqUrl.substring(0, 150)}...`);
            try {
                const parsed = new URL(reqUrl);
                const mime = parsed.searchParams.get('mime');
                const itag = parsed.searchParams.get('itag');
                console.log(`  -> MIME: ${mime}, itag: ${itag}`);
                
                // If it is video/mp4, save it
                if (mime && mime.includes('video/mp4') && !videoSrc) {
                    videoSrc = reqUrl;
                    console.log(`  🌟 Found MP4 stream URL!`);
                }
            } catch (e) {}
        }
        request.continue();
    });

    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        console.log(`Page navigated.`);
    } catch (e) {
        console.log(`Navigation error:`, e.message);
    }

    // Wait for 10 seconds to let the video player load and start
    await new Promise(resolve => setTimeout(resolve, 10000));

    const pageInfo = await page.evaluate(() => {
        const videoEl = document.querySelector('video');
        return {
            title: document.title,
            videoSrc: videoEl ? videoEl.src : null,
            videoHtml: videoEl ? videoEl.outerHTML : null
        };
    });

    console.log(`Page Info:`, pageInfo);
    if (videoSrc) {
        console.log(`Found direct URL:`, videoSrc);
    } else {
        console.log(`No direct MP4 URL found.`);
    }

    await browser.close();
})();
