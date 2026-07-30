/* Side-TOC scroll spy shared by the case-study pages (deeli/, swiftly/, nyu/).
 * Loaded per page via <script type="module" src="/src/caseNav.ts"> at the end
 * of <body>; each page is its own Vite entry, so this bundles per page.
 * A module is deferred, but that's safe: the spy recomputes on 'load',
 * fonts.ready and a timeout anyway. Do not inline a copy into any page. */

const railCol = document.querySelector<HTMLElement>(".cs-rail-col");
const nav = document.querySelector<HTMLElement>(".cs-side");

if (railCol && nav) {
  const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>('ol a[href^="#sec-"]'));
  const sections = links.flatMap((link) => {
    const id = (link.getAttribute("href") ?? "").slice(1);
    const el = document.getElementById(id);
    return el ? [{ id, el, link }] : [];
  });

  if (sections.length) {
    let activeId: string | null = null;

    const setActive = (id: string | null) => {
      if (id === activeId) return;
      activeId = id;
      for (const s of sections) {
        if (s.id === id) s.link.setAttribute("aria-current", "location");
        else s.link.removeAttribute("aria-current");
      }
    };

    const computeActive = () => {
      if (getComputedStyle(railCol).display === "none") return; // rail hidden <1000px: skip cheaply

      const doc = document.documentElement;
      const scrollY = window.pageYOffset || doc.scrollTop;
      const viewportH = window.innerHeight;
      const scrollHeight = Math.max(doc.scrollHeight, document.body ? document.body.scrollHeight : 0);

      // bottom-of-page fallback: last section wins even if too short to reach the reading line
      if (scrollY + viewportH >= scrollHeight - 2) {
        setActive(sections[sections.length - 1].id);
        return;
      }

      const readingLine = scrollY + viewportH * 0.375; // ~37.5% down viewport, matches scroll-margin-top offset
      let current: string | null = null;
      for (const s of sections) {
        const top = s.el.getBoundingClientRect().top + scrollY;
        if (top <= readingLine) current = s.id;
        else break;
      }
      setActive(current); // null above the first section: nothing active
    };

    let ticking = false;
    const onScrollOrResize = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        computeActive();
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize, { passive: true });
    // A backgrounded tab suspends rAF, which can strand `ticking` true and drop
    // every later scroll event. Reset and recompute directly on refocus.
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        ticking = false;
        computeActive();
      }
    });

    for (const s of sections) {
      s.link.addEventListener("click", () => {
        setActive(s.id); // settle instantly on click, before the (instant) jump lands
      });
    }

    // deep-link load (e.g. #sec-impact): seed from the hash immediately so the
    // correct item is highlighted before any scroll event has a chance to fire.
    const hash = window.location.hash.slice(1);
    if (hash && sections.some((s) => s.id === hash)) {
      setActive(hash);
    }
    // Reconcile once layout/scroll has truly settled. Deliberately NOT run on the
    // very next animation frame: at that point web fonts may not have swapped in
    // yet and the browser's native hash-scroll may not have landed, so
    // scrollHeight/scrollY can be transiently wrong (e.g. spuriously tripping the
    // bottom-of-page fallback and clobbering a correct hash-seeded section with
    // nothing left to correct it afterward). 'load' and fonts.ready cover the
    // normal cases; the timeout is a safety net that fires regardless.
    window.addEventListener("load", computeActive);
    if (document.fonts?.ready) document.fonts.ready.then(computeActive);
    setTimeout(computeActive, 400);
  }
}

export {};
