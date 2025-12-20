// Stock dashboard cover images
// These are gradient-based images that can be used as dashboard backgrounds

export const stockImages = [
    {
        id: 'gradient-1',
        name: 'Ocean Blue',
        gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        thumbnail: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    },
    {
        id: 'gradient-2',
        name: 'Sunset Orange',
        gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
        thumbnail: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)'
    },
    {
        id: 'gradient-3',
        name: 'Forest Green',
        gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
        thumbnail: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)'
    },
    {
        id: 'gradient-4',
        name: 'Purple Dream',
        gradient: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
        thumbnail: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)'
    },
    {
        id: 'gradient-5',
        name: 'Cosmic',
        gradient: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
        thumbnail: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)'
    },
    {
        id: 'gradient-6',
        name: 'Mint Fresh',
        gradient: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
        thumbnail: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)'
    },
    {
        id: 'gradient-7',
        name: 'Royal',
        gradient: 'linear-gradient(135deg, #ff6e7f 0%, #bfe9ff 100%)',
        thumbnail: 'linear-gradient(135deg, #ff6e7f 0%, #bfe9ff 100%)'
    },
    {
        id: 'gradient-8',
        name: 'Twilight',
        gradient: 'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)',
        thumbnail: 'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)'
    },
    {
        id: 'gradient-9',
        name: 'Fire',
        gradient: 'linear-gradient(135deg, #f77062 0%, #fe5196 100%)',
        thumbnail: 'linear-gradient(135deg, #f77062 0%, #fe5196 100%)'
    },
    {
        id: 'gradient-10',
        name: 'Aurora',
        gradient: 'linear-gradient(135deg, #fbc2eb 0%, #a6c1ee 100%)',
        thumbnail: 'linear-gradient(135deg, #fbc2eb 0%, #a6c1ee 100%)'
    },
    {
        id: 'gradient-11',
        name: 'Emerald',
        gradient: 'linear-gradient(135deg, #d299c2 0%, #fef9d7 100%)',
        thumbnail: 'linear-gradient(135deg, #d299c2 0%, #fef9d7 100%)'
    },
    {
        id: 'gradient-12',
        name: 'Midnight',
        gradient: 'linear-gradient(135deg, #2e3192 0%, #1bffff 100%)',
        thumbnail: 'linear-gradient(135deg, #2e3192 0%, #1bffff 100%)'
    }
]

export function getStockImage(id: string) {
    return stockImages.find(img => img.id === id)
}

export function getStockImageGradient(id: string) {
    const image = getStockImage(id)
    return image?.gradient || stockImages[0].gradient
}
