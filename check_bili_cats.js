const fs = require('fs');

const videos = JSON.parse(fs.readFileSync('bilibili_verified_active.json', 'utf8'));

const categoryMap = {
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

for (const v of videos) {
    const text = (v.title + ' ' + (v.tname || '')).toLowerCase();
    
    if (text.includes('鬼畜') || text.includes('音mad') || text.includes('洗脑') || text.includes('魔性') || text.includes('梗') || text.includes('华农') || text.includes('念诗') || text.includes('敢杀') || text.includes('赵本山') || text.includes('李云龙') || text.includes('诸葛') || text.includes('倒放')) {
        categoryMap.kuso.push(v);
    }
    if (text.includes('搞笑') || text.includes('段子') || text.includes('笑死') || text.includes('整蛊') || text.includes('喜剧') || text.includes('沙雕') || text.includes('逗比') || text.includes('打工人') || text.includes('离谱') || text.includes('名场面')) {
        categoryMap.comedy.push(v);
    }
    if (text.includes('科技') || text.includes('数码') || text.includes('手机') || text.includes('ai') || text.includes('大模型') || text.includes('电脑') || text.includes('极客') || text.includes('苹果') || text.includes('折叠屏') || text.includes('芯片') || text.includes('测评') || text.includes('影视飓风') || text.includes('何同学')) {
        categoryMap.tech.push(v);
    }
    if (text.includes('穿搭') || text.includes('时尚') || text.includes('美妆') || text.includes('ootd') || text.includes('时装') || text.includes('发型') || text.includes('化妆') || text.includes('高级感') || text.includes('汉服') || text.includes('旗袍')) {
        categoryMap.fashion.push(v);
    }
    if (text.includes('明星') || text.includes('影视') || text.includes('电影') || text.includes('音乐') || text.includes('歌手') || text.includes('演唱会') || text.includes('八卦') || text.includes('新片') || text.includes('大片') || text.includes('奥斯卡')) {
        categoryMap.ent.push(v);
    }
    if (text.includes('猫') || text.includes('狗') || text.includes('修勾') || text.includes('萌宠') || text.includes('喵') || text.includes('汪') || text.includes('小狗') || text.includes('小猫') || text.includes('金毛') || text.includes('柯基')) {
        categoryMap.pets.push(v);
        categoryMap.animal.push(v);
    }
    if (text.includes('野生') || text.includes('动物世界') || text.includes('自然') || text.includes('东北虎') || text.includes('大熊猫') || text.includes('森林') || text.includes('海洋') || text.includes('生灵') || text.includes('动物')) {
        categoryMap.wildlife.push(v);
        categoryMap.animal.push(v);
    }
    if (text.includes('营销') || text.includes('商业') || text.includes('知识') || text.includes('经济') || text.includes('干货') || text.includes('罗翔') || text.includes('法律') || text.includes('科普') || text.includes('硬核') || text.includes('暴利') || text.includes('创业')) {
        categoryMap.marketing.push(v);
    }
}

for (const [k, v] of Object.entries(categoryMap)) {
    console.log(`Category [${k}]: ${v.length} videos`);
}
