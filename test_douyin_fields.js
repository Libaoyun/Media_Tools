const axios = require('axios');

async function checkWordFields() {
    const res = await axios.get('https://aweme.snssdk.com/aweme/v1/hot/search/list/', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
            'Referer': 'https://www.douyin.com/'
        }
    });
    const words = res.data?.data?.word_list || [];
    console.log('Total words:', words.length);
    console.log('First word object:', JSON.stringify(words[0], null, 2));
    console.log('Second word object:', JSON.stringify(words[1], null, 2));
}

checkWordFields();
