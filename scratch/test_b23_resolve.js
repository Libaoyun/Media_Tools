const axios = require('axios');

const shortUrl = 'https://b23.tv/BV1rFg8zcEaN'; // wait, b23.tv/XXXXXX is the typical short url format

async function resolveUrl() {
    try {
        console.log('Resolving short URL...');
        const res = await axios.get(shortUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            maxRedirects: 5
        });
        console.log('Redirected URL:', res.request.res.responseUrl);
    } catch (e) {
        console.error(e.message);
    }
}

resolveUrl();
