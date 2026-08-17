(() => {
  const header = document.querySelector("[data-site-header]");
  if (!header) return;

  const menuButton = header.querySelector("[data-menu-button]");
  const mobileNavigation = header.querySelector("[data-mobile-navigation]");
  const transparentAtTop = header.dataset.transparentAtTop === "true";

  const updateScrollState = () => {
    header.classList.toggle("is-scrolled", !transparentAtTop || window.scrollY > 8);
  };

  const setMenuOpen = (open, restoreFocus = false) => {
    if (!menuButton || !mobileNavigation) return;
    header.classList.toggle("is-menu-open", open);
    menuButton.setAttribute("aria-expanded", String(open));
    menuButton.setAttribute("aria-label", open ? "关闭菜单" : "打开菜单");
    mobileNavigation.hidden = !open;
    if (!open && restoreFocus) menuButton.focus();
  };

  updateScrollState();
  if (transparentAtTop) {
    window.addEventListener("scroll", updateScrollState, { passive: true });
  }

  menuButton?.addEventListener("click", () => {
    setMenuOpen(menuButton.getAttribute("aria-expanded") !== "true");
  });

  mobileNavigation?.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("a")) {
      setMenuOpen(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menuButton?.getAttribute("aria-expanded") === "true") {
      setMenuOpen(false, true);
    }
  });

  const desktopQuery = window.matchMedia("(min-width: 768px)");
  desktopQuery.addEventListener("change", (event) => {
    if (event.matches) setMenuOpen(false);
  });
})();
