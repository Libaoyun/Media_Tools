const puppeteer = require('puppeteer');

(async () => {
    const url = 'https://www.bilibili.com/video/BV1rFg8zcEaN/?share_source=copy_web&vd_source=41fceef392c312ffdad2e38689bb8792';
    console.log(`Starting browser for URL: ${url}`);
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
    
    // Use iPad UA
    await page.setUserAgent('Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1');
    
    let videoSrc = null;
    await page.setRequestInterception(true);
    page.on('request', (request) => {
        const reqUrl = request.url();
        if (reqUrl.includes('/x/player/wbi/playurl') || reqUrl.includes('/x/player/playurl')) {
            console.log(`Intercepted request: ${reqUrl}`);
            try {
                const parsedUrl = new URL(reqUrl);
                parsedUrl.searchParams.set('fnval', '0');
                parsedUrl.searchParams.set('qn', '80');
                request.continue({ url: parsedUrl.toString() });
                console.log(`Successfully modified Bilibili parameters`);
                return;
            } catch (e) {
                console.error(`Error modifying URL:`, e);
            }
        }
        request.continue();
    });

    page.on('response', async (response) => {
        const reqUrl = response.url();
        if (reqUrl.includes('/x/player/wbi/playurl') || reqUrl.includes('/x/player/playurl')) {
            console.log(`Intercepted response: ${reqUrl}`);
            try {
                const json = await response.json();
                console.log(`Response JSON structure:`, JSON.stringify(json).substring(0, 500));
                if (json?.data?.durl?.[0]?.url) {
                    videoSrc = json.data.durl[0].url;
                    console.log(`Found direct URL: ${videoSrc}`);
                } else if (json?.data?.dash?.video?.[0]?.baseUrl) {
                    videoSrc = json.data.dash.video[0].baseUrl;
                    console.log(`Found DASH URL: ${videoSrc}`);
                }
            } catch (e) {
                console.error(`Error parsing JSON response:`, e.message);
            }
        }
    });

    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        console.log(`Page navigated successfully`);
    } catch (e) {
        console.log(`Navigation error/timeout:`, e.message);
    }

    await new Promise(resolve => setTimeout(resolve, 3000));

    const pageInfo = await page.evaluate(() => {
        return {
            title: document.title,
            bodyExists: !!document.body,
            bodyHtmlLength: document.body ? document.body.innerHTML.length : 0,
            playinfoExists: !!window.__playinfo__,
            initialStateExists: !!window.__INITIAL_STATE__
        };
    });

    console.log(`Page Info:`, pageInfo);
    
    await browser.close();
})();
