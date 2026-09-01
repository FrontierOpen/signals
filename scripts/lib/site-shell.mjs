const themeStorageKey = "frontier-theme:v1";

export function renderThemeBootScript() {
  return `<script data-theme-boot>(()=>{const key=${JSON.stringify(themeStorageKey)};let mode="system";try{const stored=window.localStorage.getItem(key);if(stored==="system"||stored==="light"||stored==="dark")mode=stored}catch{}const theme=mode==="system"?(window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):mode;const root=document.documentElement;root.dataset.themeMode=mode;root.dataset.theme=theme;root.style.colorScheme=theme;const themeColor=document.querySelector('meta[name="theme-color"]');if(themeColor)themeColor.setAttribute("content",theme==="light"?"#ffffff":"#050608")})();</script>`;
}

export function renderSiteHeader({ home = false, sticky = false } = {}) {
  const firstLinks = home
    ? '<a href="#latest">最新观察</a><a href="#archive">文章档案</a>'
    : '<a href="/">首页</a><a href="/2026/">2026</a>';
  const links = `${firstLinks}<a href="https://frontierworld.ai/" rel="noopener noreferrer">Frontier World</a>`;
  const headerClass = sticky ? "site-header" : "top";

  return `<header class="${headerClass}" data-site-header data-transparent-at-top="true"><div class="site-header-bar"><a class="brand" href="/" aria-label="Frontier Signals 首页"><span class="mark" aria-hidden="true"></span><span class="brand-copy"><strong>Frontier Signals</strong><small>by Frontier World</small></span></a><nav class="top-nav" aria-label="主导航">${links}</nav><div class="site-header-actions"><button class="theme-control theme-button" type="button" aria-label="选择主题，当前：跟随设备" aria-haspopup="menu" aria-expanded="false" aria-controls="site-theme-menu-v4" data-theme-control data-theme-button><span class="theme-icon" aria-hidden="true"></span><span class="theme-button-label">主题</span></button><button class="menu-button" type="button" aria-label="打开菜单" aria-expanded="false" aria-controls="site-mobile-navigation" data-menu-button><span class="menu-icon" aria-hidden="true"></span></button></div></div><nav class="mobile-nav site-glass-menu" id="site-mobile-navigation" aria-label="移动端主导航" data-mobile-navigation hidden>${links}</nav></header>`;
}
