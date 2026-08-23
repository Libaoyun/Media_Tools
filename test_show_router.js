const fs = require('fs');
const data = JSON.parse(fs.readFileSync('douyin_router_full.json', 'utf-8'));
console.log('LoaderData:', JSON.stringify(data.loaderData, null, 2));
