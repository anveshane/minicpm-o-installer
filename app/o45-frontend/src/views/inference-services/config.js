/**
 * 推理服务看板配置文件
 */

// 区域配置（包含标签、值和对应的API路径）
export const REGIONS = [
    {
        label: '中国单工',
        value: 'region1',
        apiPath: '/api/region1/inference/services'
    },
    {
        label: '中国双工',
        value: 'region2',
        apiPath: '/api/region2/inference/services'
    },
    {
        label: '美国单工',
        value: 'region3',
        apiPath: '/api/region3/inference/services'
    },
    {
        label: '美国双工',
        value: 'region4',
        apiPath: '/api/region4/inference/services'
    },
    {
        label: '欧洲单工',
        value: 'region5',
        apiPath: '/api/region5/inference/services'
    },
    {
        label: '欧洲双工',
        value: 'region6',
        apiPath: '/api/region6/inference/services'
    },
    {
        label: '印度单工',
        value: 'region7',
        apiPath: '/api/region7/inference/services'
    },
    {
        label: '印度双工',
        value: 'region8',
        apiPath: '/api/region8/inference/services'
    }
];

// 获取区域对应的API路径
export const getRegionApiPath = regionValue => {
    const region = REGIONS.find(r => r.value === regionValue);
    return region?.apiPath || REGIONS[0].apiPath;
};
