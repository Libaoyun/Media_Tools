const axios = require('axios');

const instances = [
    'https://cobalt.moe',
    'https://cobalt.perennial.ink',
    'https://cobalt.q69.de',
    'https://cobalt.anime.house',
    'https://cobalt.kuro.earth',
    'https://api.cobalt.rip',
    'https://cobalt.perennial.ink/api',
    'https://cobalt.sh',
    'https://cobalt.colin.re'
];

(async () => {
    const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    
    for (const inst of instances) {
        console.log(`\nTesting instance: ${inst}`);
        try {
            // First do a GET request to check if it's online
            const check = await axios.get(inst, { timeout: 3000 }).catch(e => e.response);
            if (check) {
                console.log(`  GET status: ${check.status}`);
            }
            
            // Try to send POST request
            const response = await axios.post(inst, {
                url: url,
                videoQuality: '720'
            }, {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                timeout: 5000
            });

            console.log(`  POST Success! Status:`, response.status);
            console.log(`  Data:`, JSON.stringify(response.data));
            console.log(`  🏆 WORKING INSTANCE: ${inst}`);
            break;
        } catch (e) {
            console.log(`  Error:`, e.response ? { status: e.response.status, data: e.response.data } : e.message);
        }
    }
})();
