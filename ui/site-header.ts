import { animate } from "motion/mini";

const STORAGE_KEY = "frontier-theme:v1";
const THEME_CHANGE_EVENT = "frontier-theme-change";
const THEME_MODES = ["system", "light", "dark"] as const;
const THEME_LABELS: Record<ThemeMode, string> = {
  system: "跟随设备",
  light: "浅色",
  dark: "深色",
};
const MOTION_EASE = [0.22, 1, 0.36, 1] as const;
const DESKTOP_QUERY = "(min-width: 1024px)";

type ThemeMode = (typeof THEME_MODES)[number];
type MotionAnimation = ReturnType<typeof animate>;

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

function createIcon(mode: ThemeMode | "check"): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", mode === "check" ? "2" : "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");

  const path = (attributes: Record<string, string>) => {
    const element = document.createElementNS(SVG_NAMESPACE, "path");
    Object.entries(attributes).forEach(([name, value]) => {
      element.setAttribute(name, value);
    });
    svg.append(element);
  };

  if (mode === "system") {
    const rect = document.createElementNS(SVG_NAMESPACE, "rect");
    rect.setAttribute("x", "3");
    rect.setAttribute("y", "4");
    rect.setAttribute("width", "18");
    rect.setAttribute("height", "13");
    rect.setAttribute("rx", "2");
    svg.append(rect);
    path({ d: "M8 21h8" });
    path({ d: "M12 17v4" });
  } else if (mode === "light") {
    const circle = document.createElementNS(SVG_NAMESPACE, "circle");
    circle.setAttribute("cx", "12");
    circle.setAttribute("cy", "12");
    circle.setAttribute("r", "4");
    svg.append(circle);
    path({ d: "M12 2v2" });
    path({ d: "M12 20v2" });
    path({ d: "m4.93 4.93 1.42 1.42" });
    path({ d: "m17.66 17.66 1.41 1.41" });
    path({ d: "M2 12h2" });
    path({ d: "M20 12h2" });
    path({ d: "m6.34 17.66-1.41 1.41" });
    path({ d: "m19.07 4.93-1.41 1.41" });
  } else if (mode === "dark") {
    path({ d: "M12 3a6 6 0 1 0 9 9 9 9 0 0 1-9-9Z" });
  } else {
    path({ d: "m20 6-11 11-5-5" });
  }

  return svg;
}

function isThemeMode(value: string | null | undefined): value is ThemeMode {
  return THEME_MODES.some((mode) => mode === value);
}

function bootSiteHeader() {
  const root = document.documentElement;
  const systemTheme = window.matchMedia("(prefers-color-scheme: light)");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const storedThemeMode = (): ThemeMode => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      return isThemeMode(stored) ? stored : "system";
    } catch {
      return "system";
    }
  };

  const currentThemeMode = (): ThemeMode => {
    const mode = root.dataset.themeMode;
    return isThemeMode(mode) ? mode : storedThemeMode();
  };

  const resolveTheme = (mode: ThemeMode): Exclude<ThemeMode, "system"> => {
    if (mode !== "system") return mode;
    return systemTheme.matches ? "light" : "dark";
  };

  const syncThemeColor = (theme: Exclude<ThemeMode, "system">) => {
    const themeColor = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );
    themeColor?.setAttribute(
      "content",
      theme === "light" ? "#ffffff" : "#050608",
    );
  };

  const applyThemeMode = (
    mode: ThemeMode,
    { persist = false, notify = false } = {},
  ) => {
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

  const header = document.querySelector<HTMLElement>("[data-site-header]");
  if (!header || header.dataset.siteHeaderReady === "true") return;
  header.dataset.siteHeaderReady = "true";

  const menuButton = header.querySelector<HTMLButtonElement>(
    "[data-menu-button]",
  );
  const mobileNavigation = header.querySelector<HTMLElement>(
    "[data-mobile-navigation]",
  );
  const themeButton = header.querySelector<HTMLButtonElement>(
    "[data-theme-button]",
  );
  const themeIcon = themeButton?.querySelector<HTMLElement>(".theme-icon");
  const transparentAtTop = header.dataset.transparentAtTop === "true";

  let themeMenu: HTMLDivElement | null = null;
  let mobileAnimation: MotionAnimation | null = null;
  let themeAnimation: MotionAnimation | null = null;
  let mobileMotionVersion = 0;
  let themeMotionVersion = 0;

  const clearTransform = (element: HTMLElement) => {
    element.style.removeProperty("transform");
  };

  const enter = (
    element: HTMLElement,
    offset: number,
    duration: number,
    previous: MotionAnimation | null,
    onCreate: (animation: MotionAnimation | null) => void,
  ) => {
    previous?.stop();
    element.style.animation = "none";
    clearTransform(element);
    if (reducedMotion.matches) {
      onCreate(null);
      return;
    }
    const animation = animate(
      element,
      { transform: [`translateY(${offset}px)`, "translateY(0px)"] },
      { duration, ease: MOTION_EASE },
    );
    onCreate(animation);
    animation.finished.then(
      () => {
        clearTransform(element);
        onCreate(null);
      },
      () => {},
    );
  };

  const visibleFocusableElements = () =>
    Array.from(
      document.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter(
      (element) =>
        element.getClientRects().length > 0 && !themeMenu?.contains(element),
    );

  const updateScrollState = () => {
    header.classList.toggle(
      "is-scrolled",
      !transparentAtTop || window.scrollY > 80,
    );
  };

  const finishMobileClose = (version: number) => {
    if (!mobileNavigation || version !== mobileMotionVersion) return;
    mobileNavigation.hidden = true;
    clearTransform(mobileNavigation);
    header.classList.remove("is-menu-open");
    mobileAnimation = null;
  };

  const setMobileMenuOpen = (
    open: boolean,
    { restoreFocus = false, immediate = false } = {},
  ) => {
    if (!menuButton || !mobileNavigation) return;
    const version = ++mobileMotionVersion;
    mobileAnimation?.stop();
    mobileAnimation = null;
    menuButton.setAttribute("aria-expanded", String(open));
    menuButton.setAttribute("aria-label", open ? "关闭菜单" : "打开菜单");

    if (open) {
      header.classList.add("is-menu-open");
      mobileNavigation.hidden = false;
      enter(
        mobileNavigation,
        -8,
        0.18,
        mobileAnimation,
        (animation) => {
          if (version === mobileMotionVersion) mobileAnimation = animation;
        },
      );
    } else if (mobileNavigation.hidden || immediate || reducedMotion.matches) {
      finishMobileClose(version);
    } else {
      mobileAnimation = animate(
        mobileNavigation,
        { transform: ["translateY(0px)", "translateY(-6px)"] },
        { duration: 0.14, ease: MOTION_EASE },
      );
      mobileAnimation.finished.then(
        () => finishMobileClose(version),
        () => {},
      );
    }

    if (!open && restoreFocus) menuButton.focus();
  };

  const updateThemeControl = () => {
    if (!themeButton) return;
    const mode = currentThemeMode();
    const label = THEME_LABELS[mode];
    themeButton.dataset.themeMode = mode;
    themeButton.setAttribute("aria-label", `选择主题，当前：${label}`);
    themeButton.setAttribute("title", `主题：${label}`);
    themeIcon?.replaceChildren(createIcon(mode));
    themeMenu
      ?.querySelectorAll<HTMLButtonElement>("[data-theme-option]")
      .forEach((option) => {
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
      Math.max(viewportPadding, triggerRect.right - menuWidth),
    );
    const top = Math.min(
      window.innerHeight - menuHeight - viewportPadding,
      Math.max(viewportPadding, triggerRect.bottom + 8),
    );
    themeMenu.style.left = `${left}px`;
    themeMenu.style.top = `${top}px`;
  };

  const finishThemeClose = (version: number) => {
    if (!themeMenu || version !== themeMotionVersion) return;
    themeMenu.hidden = true;
    clearTransform(themeMenu);
    themeAnimation = null;
  };

  const closeThemeMenu = (
    { restoreFocus = false, immediate = false } = {},
  ) => {
    if (!themeButton || !themeMenu || themeMenu.hidden) return;
    const version = ++themeMotionVersion;
    themeAnimation?.stop();
    themeAnimation = null;
    themeButton.setAttribute("aria-expanded", "false");

    if (immediate || reducedMotion.matches) {
      finishThemeClose(version);
    } else {
      themeAnimation = animate(
        themeMenu,
        { transform: ["translateY(0px)", "translateY(-5px)"] },
        { duration: 0.12, ease: MOTION_EASE },
      );
      themeAnimation.finished.then(
        () => finishThemeClose(version),
        () => {},
      );
    }

    if (restoreFocus) themeButton.focus();
  };

  const focusAdjacentToThemeButton = (backward: boolean) => {
    if (!themeButton) return;
    const focusable = visibleFocusableElements();
    const triggerIndex = focusable.indexOf(themeButton);
    const next = focusable[triggerIndex + (backward ? -1 : 1)] || themeButton;
    closeThemeMenu({ immediate: true });
    window.requestAnimationFrame(() => next.focus());
  };

  const handleThemeMenuKeydown = (event: KeyboardEvent) => {
    if (!themeMenu) return;
    if (event.key === "Tab") {
      event.preventDefault();
      focusAdjacentToThemeButton(event.shiftKey);
      return;
    }
    if (
      ![
        "ArrowDown",
        "ArrowRight",
        "ArrowUp",
        "ArrowLeft",
        "Home",
        "End",
      ].includes(event.key)
    ) {
      return;
    }
    event.preventDefault();
    const options = Array.from(
      themeMenu.querySelectorAll<HTMLButtonElement>("[data-theme-option]"),
    );
    const focusedIndex = Math.max(0, options.indexOf(document.activeElement as HTMLButtonElement));
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
    themeMenu.id =
      themeButton.getAttribute("aria-controls") || "site-theme-menu-v5";
    themeMenu.className = "theme-mode-menu site-glass-menu";
    themeMenu.setAttribute("role", "menu");
    themeMenu.setAttribute("aria-label", "主题选择");
    themeMenu.dataset.themeMenu = "";
    themeMenu.dataset.motionManaged = "true";
    themeMenu.hidden = true;
    themeMenu.addEventListener("keydown", handleThemeMenuKeydown);

    THEME_MODES.forEach((mode) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "theme-mode-option";
      option.dataset.themeOption = mode;
      option.setAttribute("role", "menuitemradio");

      const icon = document.createElement("span");
      icon.className = "theme-mode-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.append(createIcon(mode));

      const label = document.createElement("span");
      label.className = "theme-mode-label";
      label.textContent = THEME_LABELS[mode];

      const check = document.createElement("span");
      check.className = "theme-mode-check";
      check.setAttribute("aria-hidden", "true");
      check.append(createIcon("check"));

      option.append(icon, label, check);
      option.addEventListener("click", () => {
        applyThemeMode(mode, { persist: true, notify: true });
        updateThemeControl();
        closeThemeMenu({ restoreFocus: true });
      });
      themeMenu?.append(option);
    });

    document.body.append(themeMenu);
    updateThemeControl();
    return themeMenu;
  };

  const openThemeMenu = () => {
    if (!themeButton) return;
    const menu = ensureThemeMenu();
    if (!menu) return;
    setMobileMenuOpen(false, { immediate: true });
    const version = ++themeMotionVersion;
    themeAnimation?.stop();
    themeAnimation = null;
    menu.hidden = false;
    themeButton.setAttribute("aria-expanded", "true");
    updateThemeControl();
    updateThemeMenuPosition();
    enter(menu, -6, 0.16, themeAnimation, (animation) => {
      if (version === themeMotionVersion) themeAnimation = animation;
    });
    const selected = menu.querySelector<HTMLElement>('[aria-checked="true"]');
    window.requestAnimationFrame(() => selected?.focus());
  };

  updateScrollState();
  updateThemeControl();
  mobileNavigation?.setAttribute("data-motion-managed", "true");

  if (transparentAtTop) {
    window.addEventListener("scroll", updateScrollState, { passive: true });
  }

  menuButton?.addEventListener("click", () => {
    const open = menuButton.getAttribute("aria-expanded") !== "true";
    closeThemeMenu({ immediate: true });
    setMobileMenuOpen(open);
  });

  mobileNavigation?.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("a")) {
      setMobileMenuOpen(false);
    }
  });

  themeButton?.addEventListener("click", () => {
    if (themeButton.getAttribute("aria-expanded") === "true") {
      closeThemeMenu();
    } else {
      openThemeMenu();
    }
  });

  document.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (
      themeMenu &&
      !themeMenu.hidden &&
      !themeButton?.contains(target) &&
      !themeMenu.contains(target)
    ) {
      closeThemeMenu();
    }
    if (
      menuButton?.getAttribute("aria-expanded") === "true" &&
      !header.contains(target)
    ) {
      setMobileMenuOpen(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (themeMenu && !themeMenu.hidden) {
      closeThemeMenu({ restoreFocus: true });
      return;
    }
    if (menuButton?.getAttribute("aria-expanded") === "true") {
      setMobileMenuOpen(false, { restoreFocus: true });
    }
  });

  window.addEventListener("resize", updateThemeMenuPosition, {
    passive: true,
  });
  window.addEventListener("scroll", updateThemeMenuPosition, {
    passive: true,
  });
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

  const desktopQuery = window.matchMedia(DESKTOP_QUERY);
  const handleDesktopChange = (event: MediaQueryListEvent) => {
    if (event.matches) setMobileMenuOpen(false, { immediate: true });
  };
  if (typeof desktopQuery.addEventListener === "function") {
    desktopQuery.addEventListener("change", handleDesktopChange);
  } else {
    desktopQuery.addListener(handleDesktopChange);
  }
}

bootSiteHeader();
