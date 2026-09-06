import type { Router } from 'vitepress';

const STORAGE_KEY = 'vas-locale';
const BASE = import.meta.env.BASE_URL;

type Locale = 'en' | 'ru';

function localeOf(pathname: string): Locale {
  return pathname.startsWith(`${BASE}ru/`) || pathname === `${BASE}ru` ? 'ru' : 'en';
}

function isLanding(pathname: string): boolean {
  return pathname === BASE || pathname === `${BASE}index.html`;
}

// Private browsing and a blocked-storage profile both throw on access rather than returning null.
function read(): Locale | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'en' || stored === 'ru' ? stored : null;
  } catch {
    return null;
  }
}

function write(locale: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* the preference is a convenience; the site works without it */
  }
}

function preferredByBrowser(): Locale {
  const tags = navigator.languages?.length ? navigator.languages : [navigator.language];
  return tags.some((tag) => /^ru\b/i.test(tag)) ? 'ru' : 'en';
}

/**
 * Sends a reader to the locale they read in, and then stops guessing.
 *
 * The landing is the only page that redirects: a deep link is a page somebody chose, in the language
 * it is written in, and moving it would break the link a search result or a colleague handed over.
 * `?hl=en` / `?hl=ru` forces a locale and is what the footer switcher on the landing uses, so a
 * shared link can pin the language it was read in.
 *
 * Crossing locales — the navbar language switcher, or `?hl=` — is what records the preference; a
 * click that stays inside one locale is not a choice about language.
 */
export function applyLocalePreference(router: Router): void {
  if (typeof window === 'undefined') return;

  const forced = new URLSearchParams(window.location.search).get('hl');
  if (forced === 'en' || forced === 'ru') write(forced);

  const stored = read() ?? (forced === 'en' || forced === 'ru' ? forced : null);

  if (isLanding(window.location.pathname)) {
    const wanted = stored ?? preferredByBrowser();

    if (wanted === 'ru') {
      if (!stored) write('ru');
      window.location.replace(`${BASE}ru/${window.location.hash}`);
      return;
    }

    if (!stored) write('en');
  } else if (forced === 'en' || forced === 'ru') {
    const current = localeOf(window.location.pathname);

    if (current !== forced) {
      const path = window.location.pathname;
      const target = forced === 'ru' ? `${BASE}ru${path.slice(BASE.length - 1)}` : path.replace(`${BASE}ru/`, BASE);
      window.location.replace(`${target}${window.location.hash}`);
      return;
    }
  }

  let previous = localeOf(window.location.pathname);
  const onAfterRouteChanged = router.onAfterRouteChanged;

  router.onAfterRouteChanged = (to) => {
    const current = localeOf(new URL(to, window.location.origin).pathname);

    if (current !== previous) write(current);
    previous = current;

    onAfterRouteChanged?.call(router, to);
  };
}
