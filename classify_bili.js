const fs = require('fs');

const allVideos = JSON.parse(fs.readFileSync('bilibili_full_pool.json', 'utf8'));

const categoryMap = {
    all: allVideos,
    kuso: [],
    comedy: [],
    tech: [],
    fashion: [],
    ent: [],
    pets: [],
    wildlife: [],
    marketing: [],
    animal: []
};

for (const v of allVideos) {
    const text = (v.title + ' ' + (v.tname || '') + ' ' + (v.desc || '')).toLowerCase();
    
    // Kuso / Meme / Anime / Parody
    if (text.includes('鬼畜') || text.includes('音mad') || text.includes('洗脑') || text.includes('魔性') || text.includes('梗') || text.includes('华农') || text.includes('念诗') || text.includes('敢杀') || text.includes('赵本山') || text.includes('李云龙') || text.includes('诸葛') || text.includes('倒放') || text.includes('恶搞') || text.includes('二创') || text.includes('名场面') || text.includes('神曲')) {
        categoryMap.kuso.push(v);
    }
    // Comedy / Funny
    if (text.includes('搞笑') || text.includes('段子') || text.includes('笑死') || text.includes('整蛊') || text.includes('喜剧') || text.includes('沙雕') || text.includes('逗比') || text.includes('打工人') || text.includes('离谱') || text.includes('幽默') || text.includes('爆笑') || text.includes('挑战') || text.includes('发疯')) {
        categoryMap.comedy.push(v);
    }
    // Tech / Science / Gadgets
    if (text.includes('科技') || text.includes('数码') || text.includes('手机') || text.includes('ai') || text.includes('大模型') || text.includes('电脑') || text.includes('极客') || text.includes('苹果') || text.includes('折叠屏') || text.includes('芯片') || text.includes('测评') || text.includes('影视飓风') || text.includes('何同学') || text.includes('显卡') || text.includes('华为') || text.includes('代码') || text.includes('黑科技')) {
        categoryMap.tech.push(v);
    }
    // Fashion / Beauty / Style
    if (text.includes('穿搭') || text.includes('时尚') || text.includes('美妆') || text.includes('ootd') || text.includes('时装') || text.includes('发型') || text.includes('化妆') || text.includes('高级感') || text.includes('汉服') || text.includes('旗袍') || text.includes('裙') || text.includes('变美') || text.includes('护肤') || text.includes('衣橱') || text.includes('模特') || text.includes('新中式')) {
        categoryMap.fashion.push(v);
    }
    // Entertainment / Movies / Music / Celeb
    if (text.includes('明星') || text.includes('影视') || text.includes('电影') || text.includes('音乐') || text.includes('歌手') || text.includes('演唱会') || text.includes('八卦') || text.includes('新片') || text.includes('大片') || text.includes('奥斯卡') || text.includes('神仙') || text.includes('封神') || text.includes('剧透') || text.includes('预告') || text.includes('黑神话') || text.includes('原声') || text.includes('live')) {
        categoryMap.ent.push(v);
    }
    // Pets
    if (text.includes('猫') || text.includes('狗') || text.includes('修勾') || text.includes('萌宠') || text.includes('喵') || text.includes('汪') || text.includes('小狗') || text.includes('小猫') || text.includes('金毛') || text.includes('柯基') || text.includes('铲屎官') || text.includes('宠物')) {
        categoryMap.pets.push(v);
        categoryMap.animal.push(v);
    }
    // Wildlife
    if (text.includes('野生') || text.includes('动物世界') || text.includes('自然') || text.includes('东北虎') || text.includes('大熊猫') || text.includes('森林') || text.includes('海洋') || text.includes('生灵') || text.includes('动物') || text.includes('鸟') || text.includes('鱼') || text.includes('野外') || text.includes('探索') || text.includes('生态')) {
        categoryMap.wildlife.push(v);
        categoryMap.animal.push(v);
    }
    // Marketing / Business / Knowledge
    if (text.includes('营销') || text.includes('商业') || text.includes('知识') || text.includes('经济') || text.includes('干货') || text.includes('罗翔') || text.includes('法律') || text.includes('科普') || text.includes('硬核') || text.includes('暴利') || text.includes('创业') || text.includes('搞钱') || text.includes('内幕') || text.includes('自媒体') || text.includes('财经') || text.includes('骗局') || text.includes('真相')) {
        categoryMap.marketing.push(v);
    }
}

for (const [k, v] of Object.entries(categoryMap)) {
    console.log(`Category [${k}]: ${v.length} verified real active videos`);
}

// Write out the verified active Bilibili catalog
fs.writeFileSync('bilibili_categorized_real.json', JSON.stringify(categoryMap, null, 2));
