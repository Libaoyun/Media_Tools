const { fetchDouyinLiveTrends } = require('./lib/douyin-trends');

async function test() {
    console.log('Testing fetchDouyinLiveTrends for "all"...');
    const allList = await fetchDouyinLiveTrends('all', 'all');
    console.log('All list length:', allList.length);
    console.log('Top 3 items:', allList.slice(0, 3).map(v => ({
        id: v.id,
        title: v.title,
        cover: v.cover,
        url: v.url,
        playCount: v.playCount
    })));

    console.log('\nTesting fetchDouyinLiveTrends for "comedy"...');
    const comedyList = await fetchDouyinLiveTrends('comedy', 'all');
    console.log('Comedy list length:', comedyList.length);
    console.log('Comedy items:', comedyList.slice(0, 3).map(v => ({
        id: v.id,
        title: v.title,
        cover: v.cover
    })));
}

test();
