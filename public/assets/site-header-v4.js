(() => {
  const STORAGE_KEY = "frontier-theme:v1";
  const THEME_CHANGE_EVENT = "frontier-theme-change";
  const THEME_MODES = ["system", "light", "dark"];
  const THEME_LABELS = {
    system: "跟随设备",
    light: "浅色",
    dark: "深色",
  };
  const root = document.documentElement;
  const systemTheme = window.matchMedia("(prefers-color-scheme: light)");

  const isThemeMode = (value) => THEME_MODES.includes(value);

  const storedThemeMode = () => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      return isThemeMode(stored) ? stored : "system";
    } catch {
      return "system";
    }
  };

  const currentThemeMode = () => {
    const mode = root.dataset.themeMode;
    return isThemeMode(mode) ? mode : storedThemeMode();
  };

  const resolveTheme = (mode) => {
    if (mode !== "system") return mode;
    return systemTheme.matches ? "light" : "dark";
  };

  const syncThemeColor = (theme) => {
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) {
      themeColor.setAttribute("content", theme === "light" ? "#ffffff" : "#050608");
    }
  };

  const applyThemeMode = (mode, { persist = false, notify = false } = {}) => {
    const nextMode = isThemeMode(mode) ? mode : "system";
    const theme = resolveTheme(nextMode);
    root.dataset.themeMode = nextMode;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    syncThemeColor(theme);

    if (persist) {
      try {
        window.localStorage.setItem(STORAGE_KEY, nextMode);
      } catch {
        // The selected mode still applies for the current page.
      }
    }
    if (notify) window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  };

  applyThemeMode(currentThemeMode());

  const header = document.querySelector("[data-site-header]");
  if (!header || header.dataset.siteHeaderReady === "true") return;
  header.dataset.siteHeaderReady = "true";

  const menuButton = header.querySelector("[data-menu-button]");
  const mobileNavigation = header.querySelector("[data-mobile-navigation]");
  const themeButton = header.querySelector("[data-theme-button]");
  const transparentAtTop = header.dataset.transparentAtTop === "true";
  let themeMenu = null;

  const visibleFocusableElements = () =>
    Array.from(
      document.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter(
      (element) =>
        element instanceof HTMLElement &&
        element.getClientRects().length > 0 &&
        !themeMenu?.contains(element)
    );

  const updateScrollState = () => {
    header.classList.toggle("is-scrolled", !transparentAtTop || window.scrollY > 80);
  };

  const setMobileMenuOpen = (open, restoreFocus = false) => {
    if (!menuButton || !mobileNavigation) return;
    header.classList.toggle("is-menu-open", open);
    menuButton.setAttribute("aria-expanded", String(open));
    menuButton.setAttribute("aria-label", open ? "关闭菜单" : "打开菜单");
    mobileNavigation.hidden = !open;
    if (!open && restoreFocus) menuButton.focus();
  };

  const updateThemeControl = () => {
    if (!themeButton) return;
    const mode = currentThemeMode();
    const label = THEME_LABELS[mode];
    themeButton.dataset.themeMode = mode;
    themeButton.setAttribute("aria-label", `选择主题，当前：${label}`);
    themeButton.setAttribute("title", `主题：${label}`);
    themeMenu?.querySelectorAll("[data-theme-option]").forEach((option) => {
      const selected = option.dataset.themeOption === mode;
      option.setAttribute("aria-checked", String(selected));
      option.tabIndex = selected ? 0 : -1;
    });
  };

  const updateThemeMenuPosition = () => {
    if (!themeButton || !themeMenu || themeMenu.hidden) return;
    const triggerRect = themeButton.getBoundingClientRect();
    const menuWidth = themeMenu.offsetWidth || 176;
    const menuHeight = themeMenu.offsetHeight || 148;
    const viewportPadding = 12;
    const left = Math.min(
      window.innerWidth - menuWidth - viewportPadding,
      Math.max(viewportPadding, triggerRect.right - menuWidth)
    );
    const top = Math.min(
      window.innerHeight - menuHeight - viewportPadding,
      Math.max(viewportPadding, triggerRect.bottom + 8)
    );
    themeMenu.style.left = `${left}px`;
    themeMenu.style.top = `${top}px`;
  };

  const closeThemeMenu = (restoreFocus = false) => {
    if (!themeButton || !themeMenu || themeMenu.hidden) return;
    themeMenu.hidden = true;
    themeButton.setAttribute("aria-expanded", "false");
    if (restoreFocus) themeButton.focus();
  };

  const focusAdjacentToThemeButton = (backward) => {
    if (!themeButton) return;
    const focusable = visibleFocusableElements();
    const triggerIndex = focusable.indexOf(themeButton);
    const next = focusable[triggerIndex + (backward ? -1 : 1)] || themeButton;
    closeThemeMenu();
    window.requestAnimationFrame(() => next.focus());
  };

  const handleThemeMenuKeydown = (event) => {
    if (!themeMenu) return;
    if (event.key === "Tab") {
      event.preventDefault();
      focusAdjacentToThemeButton(event.shiftKey);
      return;
    }
    if (!["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft", "Home", "End"].includes(event.key)) {
      return;
    }
    event.preventDefault();
    const options = Array.from(themeMenu.querySelectorAll("[data-theme-option]"));
    const focusedIndex = Math.max(0, options.indexOf(document.activeElement));
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? options.length - 1
          : event.key === "ArrowDown" || event.key === "ArrowRight"
            ? (focusedIndex + 1) % options.length
            : (focusedIndex - 1 + options.length) % options.length;
    options[nextIndex]?.focus();
  };

  const ensureThemeMenu = () => {
    if (themeMenu || !themeButton) return themeMenu;
    themeMenu = document.createElement("div");
    themeMenu.id = themeButton.getAttribute("aria-controls") || "site-theme-menu-v4";
    themeMenu.className = "theme-mode-menu site-glass-menu";
    themeMenu.setAttribute("role", "menu");
    themeMenu.setAttribute("aria-label", "主题选择");
    themeMenu.dataset.themeMenu = "";
    themeMenu.hidden = true;
    themeMenu.style.gap = "4px";
    themeMenu.addEventListener("keydown", handleThemeMenuKeydown);

    THEME_MODES.forEach((mode) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "theme-mode-option";
      option.dataset.themeOption = mode;
      option.setAttribute("role", "menuitemradio");

      const label = document.createElement("span");
      label.className = "theme-mode-label";
      label.textContent = THEME_LABELS[mode];

      const indicator = document.createElement("span");
      indicator.className = "theme-mode-indicator";
      indicator.setAttribute("aria-hidden", "true");

      option.append(label, indicator);
      option.addEventListener("click", () => {
        applyThemeMode(mode, { persist: true, notify: true });
        updateThemeControl();
        closeThemeMenu(true);
      });
      themeMenu.append(option);
    });

    document.body.append(themeMenu);
    updateThemeControl();
    return themeMenu;
  };

  const openThemeMenu = () => {
    if (!themeButton) return;
    const menu = ensureThemeMenu();
    if (!menu) return;
    setMobileMenuOpen(false);
    menu.hidden = false;
    themeButton.setAttribute("aria-expanded", "true");
    updateThemeControl();
    updateThemeMenuPosition();
    const selected = menu.querySelector('[aria-checked="true"]');
    window.requestAnimationFrame(() => selected?.focus());
  };

  updateScrollState();
  updateThemeControl();

  if (transparentAtTop) {
    window.addEventListener("scroll", updateScrollState, { passive: true });
  }

  menuButton?.addEventListener("click", () => {
    const open = menuButton.getAttribute("aria-expanded") !== "true";
    closeThemeMenu();
    setMobileMenuOpen(open);
  });

  mobileNavigation?.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("a")) {
      setMobileMenuOpen(false);
    }
  });

  themeButton?.addEventListener("click", () => {
    if (themeButton.getAttribute("aria-expanded") === "true") closeThemeMenu();
    else openThemeMenu();
  });

  document.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (themeMenu && !themeMenu.hidden && !themeButton?.contains(target) && !themeMenu.contains(target)) {
      closeThemeMenu();
    }
    if (menuButton?.getAttribute("aria-expanded") === "true" && !header.contains(target)) {
      setMobileMenuOpen(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (themeMenu && !themeMenu.hidden) {
      closeThemeMenu(true);
      return;
    }
    if (menuButton?.getAttribute("aria-expanded") === "true") {
      setMobileMenuOpen(false, true);
    }
  });

  window.addEventListener("resize", updateThemeMenuPosition, { passive: true });
  window.addEventListener("scroll", updateThemeMenuPosition, { passive: true });
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    applyThemeMode(isThemeMode(event.newValue) ? event.newValue : "system");
    updateThemeControl();
  });
  window.addEventListener(THEME_CHANGE_EVENT, updateThemeControl);

  const handleSystemThemeChange = () => {
    if (currentThemeMode() === "system") applyThemeMode("system");
  };
  if (typeof systemTheme.addEventListener === "function") {
    systemTheme.addEventListener("change", handleSystemThemeChange);
  } else {
    systemTheme.addListener(handleSystemThemeChange);
  }

  const desktopQuery = window.matchMedia("(min-width: 768px)");
  const handleDesktopChange = (event) => {
    if (event.matches) setMobileMenuOpen(false);
  };
  if (typeof desktopQuery.addEventListener === "function") {
    desktopQuery.addEventListener("change", handleDesktopChange);
  } else {
    desktopQuery.addListener(handleDesktopChange);
  }
})();
