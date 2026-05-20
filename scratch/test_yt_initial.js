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
    
    // Test with Desktop User Agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        console.log(`Page navigated successfully`);
    } catch (e) {
        console.log(`Navigation error/timeout:`, e.message);
    }

    await new Promise(resolve => setTimeout(resolve, 5000));

    const result = await page.evaluate(() => {
        const response = window.ytInitialPlayerResponse;
        if (!response) return { exists: false };
        
        const title = response.videoDetails ? response.videoDetails.title : null;
        const description = response.videoDetails ? response.videoDetails.shortDescription : null;
        const thumbnail = response.videoDetails?.thumbnail?.thumbnails?.slice(-1)[0]?.url;
        
        const streamingData = response.streamingData;
        const formats = streamingData ? streamingData.formats : [];
        const adaptiveFormats = streamingData ? streamingData.adaptiveFormats : [];
        
        return {
            exists: true,
            title,
            descriptionLength: description ? description.length : 0,
            thumbnail,
            formatsCount: formats ? formats.length : 0,
            adaptiveFormatsCount: adaptiveFormats ? adaptiveFormats.length : 0,
            formats: formats ? formats.map(f => ({
                itag: f.itag,
                mimeType: f.mimeType,
                width: f.width,
                height: f.height,
                hasUrl: !!f.url,
                hasSignatureCipher: !!f.signatureCipher || !!f.cipher
            })) : []
        };
    });

    console.log(`Result:`, JSON.stringify(result, null, 2));

    await browser.close();
})();
