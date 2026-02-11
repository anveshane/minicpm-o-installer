const images = import.meta.glob('@/assets/images/scene/*.jpg', { eager: true });
const imageCollection = Object.values(images).map(img => img.default); // 图片合集

const videos = import.meta.glob('@/assets/images/sceneVideo/*.mp4', { eager: true });
const videoCollection = Object.values(videos).map(video => video.default); // 视频合集

let allCollection = []; // 全部视频图片合集

for (let i = 0; i < imageCollection.length; i++) {
    let index = imageCollection[i].indexOf('-');
    let id = Number(imageCollection[i].slice(index + 1, index + 3));
    console.log('id: ', id);
    allCollection.push({
        id: id,
        imgSrc: imageCollection[i],
        videoSrc: videoCollection[i]
    });
}
console.log('all:', allCollection);

const getList = (startIndex, endIndex) => {
    return allCollection.slice(startIndex, endIndex);
};
// 分类
const category = [
    {
        label: 'category.all',
        value: 0,
        list: allCollection // 全部视频
    },
    {
        label: 'category.topSkus1',
        value: 1,
        list: [allCollection[0]]
    },
    {
        label: 'category.topSkus2',
        value: 2,
        list: [allCollection[1]]
    },
    {
        label: 'category.topSkus3',
        value: 3,
        list: getList(2, 5)
    },
    {
        label: 'category.topSkus4',
        value: 4,
        list: getList(5, 6)
    },
    {
        label: 'category.topSkus5',
        value: 5,
        list: getList(6, 8)
    }
];

export { allCollection, category };
