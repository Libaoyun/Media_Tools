const puppeteer = require('puppeteer');
const fs = require('fs');

async function testBaijiahao() {
    console.log('Launching browser for Baijiahao...');
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
    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1');

    page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('baidu.com') || url.includes('bdstatic.com')) {
            console.log(`[Response] ${response.status()} | ${url.substring(0, 120)}`);
        }
    });

    try {
        console.log('Navigating...');
        await page.goto('https://baijiahao.baidu.com/s?id=1768407883907727187', { waitUntil: 'domcontentloaded', timeout: 15000 });
        console.log('Wait 5 seconds for page load...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        console.log('Taking screenshot...');
        await page.screenshot({ path: 'bjh_screenshot.png' });
        
        console.log('Evaluating page state...');
        const state = await page.evaluate(() => {
            return {
                title: document.title,
                hasContext: !!window.__context__,
                hasParams: !!window._params,
                contextKeys: window.__context__ ? Object.keys(window.__context__) : [],
                videoTags: Array.from(document.querySelectorAll('video')).map(v => ({ src: v.src, poster: v.poster })),
                sourceTags: Array.from(document.querySelectorAll('video source')).map(s => s.src),
                htmlLength: document.body ? document.body.innerHTML.length : 0
            };
        });
        console.log('Page state details:', JSON.stringify(state, null, 2));
        
        const html = await page.content();
        fs.writeFileSync('bjh_page.html', html, 'utf-8');
        console.log('Page source saved to bjh_page.html');
        
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await browser.close();
    }
}

testBaijiahao();
