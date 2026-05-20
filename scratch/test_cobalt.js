const axios = require('axios');

(async () => {
    const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    console.log(`Sending POST request to Cobalt API (new endpoint) for URL: ${url}`);
    
    try {
        const response = await axios.post('https://api.cobalt.tools/', {
            url: url,
            videoQuality: '720' // requesting 720p
        }, {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            timeout: 15000
        });

        console.log(`Status:`, response.status);
        console.log(`Response Data:`, JSON.stringify(response.data, null, 2));
    } catch (e) {
        console.error(`Error details:`, e.response ? {
            status: e.response.status,
            data: e.response.data
        } : e.message);
    }
})();
