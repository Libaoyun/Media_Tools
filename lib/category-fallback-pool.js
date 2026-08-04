'use strict';

const CATEGORY_FALLBACK_POOLS = {
    douyin: {
        kuso: [
            { id: 'dy_ks_1', title: '"抖音室友"给"快手室友"打电话，对歌神曲', author: '抖音爆笑特工', playRaw: 437070000, playCount: '4.3亿', cover: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=300', url: 'https://www.douyin.com/search/%E6%8A%96%E9%9F%B3%E5%AE%A4%E5%8F%8B' },
            { id: 'dy_ks_2', title: '逆天梗图9.0 爆笑反转魔性合集', author: '梗图档案馆', playRaw: 384000000, playCount: '3.8亿', cover: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=300', url: 'https://www.douyin.com/search/%E9%80%86%E5%A4%A9%E6%A2%97%E5%9B%BE' },
            { id: 'dy_ks_3', title: '全网最魔性洗脑梗曲，听一遍彻底沦陷', author: '魔性音符', playRaw: 295000000, playCount: '2.9亿', cover: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=300', url: 'https://www.douyin.com/search/%E6%AF%8F%E6%97%A5%E9%AD%94%E6%80%A7' },
            { id: 'dy_ks_4', title: '牢美抽象大赏：那些让人头皮发麻的搞笑名场面', author: '抽象大玩家', playRaw: 241000000, playCount: '2.4亿', cover: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=300', url: 'https://www.douyin.com/search/%E4%BB%A4%E4%BA%BA%E7%AA%92%E6%81%AF' },
            { id: 'dy_ks_5', title: '反诈老陈被110万改变的一生【抖音网络狠人】', author: '硬核大叔', playRaw: 198000000, playCount: '1.9亿', cover: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=300', url: 'https://www.douyin.com/search/%E7%BD%91%E7%BB%9C%E7%8B%A0%E4%BA%BA' },
            { id: 'dy_ks_6', title: '全网爆火鬼畜神曲，开口直接跪了', author: '鬼畜制造局', playRaw: 165000000, playCount: '1.6亿', cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?q=80&w=300', url: 'https://www.douyin.com/search/%E9%AC%BC%E7%95%9C%E7%A5%9E%E6%9B%B2' },
            { id: 'dy_ks_7', title: '那些让人欲罢不能的逆天神展开', author: '抽象狂热粉', playRaw: 142000000, playCount: '1.4亿', cover: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?q=80&w=300', url: 'https://www.douyin.com/search/%E7%A5%9E%E5%B1%95%E5%BC%80' },
            { id: 'dy_ks_8', title: '全网最硬核搞笑鬼畜拼盘！不笑算我输', author: '爆笑鬼畜者', playRaw: 125000000, playCount: '1.2亿', cover: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?q=80&w=300', url: 'https://www.douyin.com/search/%E7%88%86%E7%AC%91%E9%AC%BC%E7%95%9C' },
            { id: 'dy_ks_9', title: '绝了！这个魔性舞步全网模仿超800万次', author: '舞蹈神梗', playRaw: 98000000, playCount: '9800.0万', cover: 'https://images.unsplash.com/photo-1504609773096-104ff2c73ba4?q=80&w=300', url: 'https://www.douyin.com/search/%E9%AD%94%E6%80%A7%E8%99%9E%E4%B9%90' },
            { id: 'dy_ks_10', title: '搞笑神梗大串烧：看完笑掉大牙', author: '搞笑集结号', playRaw: 86000000, playCount: '8600.0万', cover: 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?q=80&w=300', url: 'https://www.douyin.com/search/%E7%A5%9E%E6%A2%97%E4%B8%B2%E7%83%A7' }
        ],
        comedy: [
            { id: 'dy_cm_1', title: '《 虚 晃 一 枪 》爆笑短剧全集', author: '搞笑喜剧人', playRaw: 628810000, playCount: '6.2亿', cover: 'https://images.unsplash.com/photo-1527224857830-43a7acc85260?q=80&w=300', url: 'https://www.douyin.com/search/%E8%99%9A%E6%89%80%E4%B8%80%E6%9E%AA' },
            { id: 'dy_cm_2', title: '全网播放破亿的社死瞬间，笑到肚子疼', author: '社死大赏', playRaw: 489000000, playCount: '4.8亿', cover: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?q=80&w=300', url: 'https://www.douyin.com/search/%E7%A4%BE%E6%AD%BB%E7%9E%AC%E9%97%B4' },
            { id: 'dy_cm_3', title: '当代情侣爆笑日常反转剧，真实得可怕', author: '情侣爆笑搞笑', playRaw: 351000000, playCount: '3.5亿', cover: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?q=80&w=300', url: 'https://www.douyin.com/search/%E6%83%85%E4%BE%A3%E7%88%86%E7%AC%91' },
            { id: 'dy_cm_4', title: '搞笑整蛊爆笑全场：这谁能顶得住啊', author: '整蛊派对', playRaw: 284000000, playCount: '2.8亿', cover: 'https://images.unsplash.com/photo-1513151233558-d860c5398176?q=80&w=300', url: 'https://www.douyin.com/search/%E6%95%B4%E7%BD%B7%E7%88%86%E7%AC%91' },
            { id: 'dy_cm_5', title: '年度爆笑幽默喜剧精选：反转再反转', author: '幽默喜剧王', playRaw: 210000000, playCount: '2.1亿', cover: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?q=80&w=300', url: 'https://www.douyin.com/search/%E5%B9%B4%E5%BA%A6%E7%88%86%E7%AC%91' },
            { id: 'dy_cm_6', title: '家庭搞笑爆笑对话：老爹的硬核操作', author: '家庭幽默剧场', playRaw: 175000000, playCount: '1.7亿', cover: 'https://images.unsplash.com/photo-1511895426328-dc8714191300?q=80&w=300', url: 'https://www.douyin.com/search/%E7%88%B6%E5%AD%90%E7%88%86%E7%AC%91' },
            { id: 'dy_cm_7', title: '宿舍爆笑黑历史：室友的奇葩行为', author: '校园社死狂', playRaw: 148000000, playCount: '1.4亿', cover: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?q=80&w=300', url: 'https://www.douyin.com/search/%E5%AE%A4%E5%8F%8B%E7%88%86%E7%AC%91' },
            { id: 'dy_cm_8', title: '路人爆笑真实反应，全程高能无尿点', author: '路人爆笑观察', playRaw: 112000000, playCount: '1.1亿', cover: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?q=80&w=300', url: 'https://www.douyin.com/search/%E8%B7%AF%E4%BA%BA%E7%88%86%E7%AC%91' }
        ],
        tech: [
            { id: 'dy_tc_1', title: '维修厮给抖音网红修电脑，直接秒杀2080显卡', author: '极客维修厮', playRaw: 200000000, playCount: '2.0亿', cover: 'https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=300', url: 'https://www.douyin.com/search/%E7%BB%B4%E4%BF%AE%E5%98%B4' },
            { id: 'dy_tc_2', title: '苹果GPT发布！Siri进化成超级AI助手', author: '数码前沿', playRaw: 168000000, playCount: '1.6亿', cover: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=300', url: 'https://www.douyin.com/search/%E8%8B%B9%E6%9E%9CAI' },
            { id: 'dy_tc_3', title: '把Sora生成的AI视频放大100倍后，恐怖的一幕出现了', author: 'AI硬核测评', playRaw: 142000000, playCount: '1.4亿', cover: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=300', url: 'https://www.douyin.com/search/Sora' },
            { id: 'dy_tc_4', title: '2025全球旗舰手机横评：谁才是年度拍照之王？', author: '数码极客评', playRaw: 115000000, playCount: '1.1亿', cover: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?q=80&w=300', url: 'https://www.douyin.com/search/%E6%97%97%E8%88%B0%E6%89%8B%E6%9C%BA' },
            { id: 'dy_tc_5', title: '华为三折叠屏实机上手！科技感直接拉满', author: '科技体验官', playRaw: 98000000, playCount: '9800.0万', cover: 'https://images.unsplash.com/photo-1526738549149-8e07eca6c147?q=80&w=300', url: 'https://www.douyin.com/search/%E4%B8%89%E6%8A%98%E5%8F%A0' },
            { id: 'dy_tc_6', title: '芯片制造到底有多难？3分钟带你看懂2nm工艺', author: '硬核科技君', playRaw: 84000000, playCount: '8400.0万', cover: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=300', url: 'https://www.douyin.com/search/%E8%AF%B7%E7%9C%8B%E8%8A%AF%E7%89%87' },
            { id: 'dy_tc_7', title: '黑科技来了！首个具身智能机器人帮居家洗碗打扫', author: '未来科技', playRaw: 72000000, playCount: '7200.0万', cover: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?q=80&w=300', url: 'https://www.douyin.com/search/%E5%85%B7%E8%BA%AB%E6%99%BA%E8%83%BD' }
        ],
        fashion: [
            { id: 'dy_fs_1', title: '中国人穿的西式复古时装让老外大受震撼', author: '复古时装潮人', playRaw: 205400000, playCount: '2.0亿', cover: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?q=80&w=300', url: 'https://www.douyin.com/search/%E6%97%B6%E5%B0%9A%E7%A9%BF%E6%90%AD' },
            { id: 'dy_fs_2', title: '男生变帅其实很简单！夏日清爽OOTD指南', author: '美妆穿搭学院', playRaw: 175000000, playCount: '1.7亿', cover: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?q=80&w=300', url: 'https://www.douyin.com/search/%E7%94%B7%E7%94%9F%E5%8F%98%E5%B8%85' },
            { id: 'dy_fs_3', title: '高级感穿搭技巧：用最基础的衣服穿出大牌感', author: '穿搭研究所', playRaw: 135000000, playCount: '1.3亿', cover: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?q=80&w=300', url: 'https://www.douyin.com/search/%E9%AB%98%E7%BA%A7%E6%84%9F%E7%A9%BF%E6%90%AD' },
            { id: 'dy_fs_4', title: '全网爆火的伪素颜妆容！手把手保姆级教程', author: '美妆小能手', playRaw: 110000000, playCount: '1.1亿', cover: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?q=80&w=300', url: 'https://www.douyin.com/search/%E4%BD%AA%E7%B4%A0%E9%A2%9C' },
            { id: 'dy_fs_5', title: '巴黎时装周秀场穿搭灵感：秋冬必备风衣指南', author: '秀场时尚范', playRaw: 89000000, playCount: '8900.0万', cover: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?q=80&w=300', url: 'https://www.douyin.com/search/%E6%97%B6%E8%A3%85%E5%91%A8' }
        ],
        marketing: [
            { id: 'dy_mk_1', title: '教科书级别营销案例：Stanley水杯全美抢疯了', author: '搞钱商业波哥', playRaw: 541040000, playCount: '5.4亿', cover: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=300', url: 'https://www.douyin.com/search/%E5%95%86%E4%B8%9A%E8%90%A5%E9%94%80' },
            { id: 'dy_mk_2', title: '所有爆款，都在利用你的这3个心理弱点', author: '商业自媒体思维', playRaw: 382000000, playCount: '3.8亿', cover: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?q=80&w=300', url: 'https://www.douyin.com/search/%E7%88%86%E6%AC%BE%E6%80%9D%E7%BB%B4' },
            { id: 'dy_mk_3', title: '2025自媒体搞钱指南：个人如何打造爆款IP', author: '创业商业课', playRaw: 290000000, playCount: '2.9亿', cover: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?q=80&w=300', url: 'https://www.douyin.com/search/%E6%90%9E%E9%92%B1IP' },
            { id: 'dy_mk_4', title: '拆解李佳琦、小杨哥直播带货黄金前3秒文案', author: '带货营销官', playRaw: 185000000, playCount: '1.8亿', cover: 'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?q=80&w=300', url: 'https://www.douyin.com/search/%E5%B8%A6%E8%B4%A7%E6%96%87%E6%A1%88' }
        ],
        animal: [
            { id: 'dy_an_1', title: '从山洞开出来的那一刻，感觉火车和猫咪都懵了', author: '萌宠喵星人', playRaw: 375370000, playCount: '3.7亿', cover: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?q=80&w=300', url: 'https://www.douyin.com/search/%E8%90%8C%E5%AE%A0' },
            { id: 'dy_an_2', title: '谁想要小猫围脖！？这也太治愈了吧', author: '萌宠小猫咪', playRaw: 363540000, playCount: '3.6亿', cover: 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?q=80&w=300', url: 'https://www.douyin.com/search/%E6%B2%BB%E6%84%88%E7%8C%AB%E5%92%AA' },
            { id: 'dy_an_3', title: '当猫咪们也去做正骨，嘎嘣嘎嘣的一声声太舒服了', author: '正骨萌宠', playRaw: 273180000, playCount: '2.7亿', cover: 'https://images.unsplash.com/photo-1533738363-b7f9aef128ce?q=80&w=300', url: 'https://www.douyin.com/search/%E7%8C%AB%E5%92%AA%E6%AD%A3%E9%AA%A8' },
            { id: 'dy_an_4', title: '这种又舍不得又舍得的感觉，养宠人懂得都懂', author: '汪星人日记', playRaw: 217700000, playCount: '2.1亿', cover: 'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?q=80&w=300', url: 'https://www.douyin.com/search/%E5%85%BB%E5%AE%A0%E4%BA%BA' },
            { id: 'dy_an_5', title: '狗狗给小主人当保镖，眼神比保安还专业', author: '硬核金毛', playRaw: 165000000, playCount: '1.6亿', cover: 'https://images.unsplash.com/photo-1552053831-71594a27632d?q=80&w=300', url: 'https://www.douyin.com/search/%E4%BF%9D%E9%95%96%E9%87%91%E6%AF%9B' }
        ]
    }
};

function getCategoryFallbackList(platform, category) {
    const platKey = String(platform).toLowerCase();
    const catKey = String(category).toLowerCase();
    const list = CATEGORY_FALLBACK_POOLS[platKey]?.[catKey] || CATEGORY_FALLBACK_POOLS.douyin[catKey] || CATEGORY_FALLBACK_POOLS.douyin.kuso;
    return list.map(item => ({
        ...item,
        platform: platform.charAt(0).toUpperCase() + platform.slice(1)
    }));
}

module.exports = { getCategoryFallbackList };
