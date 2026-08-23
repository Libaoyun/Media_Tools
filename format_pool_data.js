const fs = require('fs');

const biliData = JSON.parse(fs.readFileSync('bilibili_categorized_real.json', 'utf8'));

// Format Bilibili categories
const biliCategories = {};
for (const [cat, list] of Object.entries(biliData)) {
    biliCategories[cat] = list.map((item, idx) => ({
        id: item.id,
        title: item.title,
        author: item.author,
        playRaw: item.playRaw,
        cover: item.cover,
        url: item.url,
        duration: item.duration,
        relativeDays: (idx * 0.1) + 0.1
    }));
}

console.log('Formatted Bilibili categories:', Object.keys(biliCategories).map(k => `${k}: ${biliCategories[k].length}`));
