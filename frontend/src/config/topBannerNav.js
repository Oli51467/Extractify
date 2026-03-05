export const TOP_BANNER_NAV_ITEMS = [
  {
    key: 'extract',
    label: 'Extract',
    to: '/',
    activeRouteNames: ['DocPixExtract']
  },
  {
    key: 'merge',
    label: 'Merge',
    to: '/mergify',
    activeRouteNames: ['DocPixMerge']
  },
  {
    key: 'assets',
    label: '素材库',
    to: '/assets',
    activeRouteNames: ['DocPixAssets']
  },
  {
    key: 'history',
    label: '轨迹',
    to: '/history',
    activeRouteNames: ['DocPixHistory']
  }
]

export const TOP_BANNER_NAV_HIDDEN_ROUTES = ['DocPixLogin', 'DocPixShare']
