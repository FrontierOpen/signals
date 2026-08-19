export function renderSiteHeader({ home = false, sticky = false } = {}) {
  const firstLinks = home
    ? '<a href="#latest">最新观察</a><a href="#archive">文章档案</a>'
    : '<a href="/">首页</a><a href="/2026/">2026</a>';
  const links = `${firstLinks}<a href="https://frontierworld.ai/" rel="noopener noreferrer">Frontier World <span aria-hidden="true">↗</span></a>`;
  const headerClass = sticky ? "site-header" : "top";
  const transparentAttribute = home ? ' data-transparent-at-top="true"' : "";

  return `<header class="${headerClass}" data-site-header${transparentAttribute}><div class="site-header-bar"><a class="brand" href="/" aria-label="Frontier Signals 首页"><span class="mark" aria-hidden="true"></span><span class="brand-copy"><strong>Frontier Signals</strong><small>by Frontier World</small></span></a><nav class="top-nav" aria-label="主导航">${links}</nav><button class="menu-button" type="button" aria-label="打开菜单" aria-expanded="false" aria-controls="site-mobile-navigation" data-menu-button><span class="menu-icon" aria-hidden="true"></span></button></div><nav class="mobile-nav" id="site-mobile-navigation" aria-label="移动端主导航" data-mobile-navigation hidden>${links}</nav></header>`;
}
