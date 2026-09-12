import { defineConfig } from 'vitepress';

const HOSTNAME = 'https://asdalexey.github.io/vitest-auto-spy/';
const OG_IMAGE = `${HOSTNAME}og-image.png`;
const SITE_NAME = 'vitest-auto-spy';

// The sidebar doubles as the source the per-page BreadcrumbList JSON-LD is built from (see
// transformPageData), so it is hoisted here rather than living inside themeConfig.
//
// Every label the Russian reader sees comes from here, keyed by the English one. A label with no
// entry stays English on purpose — `Vitest`, `RxJS`, `createSpyFromClass` are names, not words.
const RU_LABEL: Record<string, string> = {
  Core: 'Ядро',
  'Spec patterns': 'Паттерны спек',
  Runtimes: 'Среды запуска',
  Utilities: 'Утилиты',
  Adapters: 'Адаптеры',
  Upgrading: 'Обновление',

  Introduction: 'Введение',
  Installation: 'Установка',
  'How it works': 'Как это устроено',
  'Control helpers': 'Управляющие хелперы',
  'Auto-mock by type': 'Автомок по типу',
  'Strict mode': 'Строгий режим',
  'Observable assertions': 'Проверки на Observable',
  'Bridging Spy<T> and T': 'Мост между Spy<T> и T',
  Performance: 'Производительность',

  'Patterns that hold up': 'Паттерны, которые держатся',

  'Angular on Bun': 'Angular на Bun',

  'Explaining a double': 'Разбор дубля',
  'Console spies': 'Спаи консоли',
  'Test-run hygiene': 'Гигиена прогона',
  'Fake timers': 'Фейковые таймеры',
  'Observer stubs': 'Заглушки Observer',
  'Constructor doubles': 'Дубли конструкторов',
  'Media element stub': 'Заглушка media-элемента',
  'Module mocks': 'Моки модулей',
  'Tracking injections': 'Отслеживание инъекций',
  'Fixtures without casts': 'Фикстуры без кастов',
  'fakeAsync on Vitest': 'fakeAsync на Vitest',
  'Waiting and the clock': 'Ожидание и часы',
  'ESLint plugin': 'Плагин ESLint',
  'ESLint rules': 'Правила ESLint',
  'CLI — doctor & init': 'CLI — doctor и init',
  'CLI — the codemod': 'CLI — кодмод',
  'Editor diagnostics': 'Диагностика в редакторе',

  'Angular diagnostics': 'Диагностика Angular',
  'Angular router': 'Роутер Angular',
  'Signal forms': 'Сигнальные формы',
  'Component provider overrides': 'Переопределение провайдеров компонента',

  'To 4.0 — rxjs out of your program': 'На 4.0 — rxjs вне вашей программы',
  'To 3.0 — the vitest peer range': 'На 3.0 — peer-диапазон vitest',
  'To 2.0 — additive methodsToSpyOn, lazy spies': 'На 2.0 — дополняющий methodsToSpyOn, ленивые спаи',

  'Migrating from jest-auto-spies': 'Переезд с jest-auto-spies',
  'Migrating from jasmine-auto-spies': 'Переезд с jasmine-auto-spies',
  'Migrating from @ngneat/spectator': 'Переезд с @ngneat/spectator',
  'Migrating from Suites': 'Переезд с Suites',
  'Migrating from @testing-library/angular': 'Переезд с @testing-library/angular',
  'After the refactor-jasmine-vitest schematic': 'После схематика refactor-jasmine-vitest',
  'API reference': 'Справочник API',
  Comparison: 'Сравнение',
  'For AI agents': 'Для ИИ-агентов',
};

const SIDEBAR = [
  {
    text: 'Core',
    collapsed: false,
    items: [
      { text: 'Introduction', link: '/core/introduction' },
      { text: 'Installation', link: '/core/installation' },
      { text: 'How it works', link: '/core/how-it-works' },
      { text: 'createSpyFromClass', link: '/core/create-spy-from-class' },
      { text: 'Control helpers', link: '/core/control-helpers' },
      { text: 'Auto-mock by type', link: '/core/auto-mock-by-type' },
      { text: 'Strict mode', link: '/core/strict-mode' },
      { text: 'Observable assertions', link: '/core/observable-assertions' },
      { text: 'Bridging Spy<T> and T', link: '/core/spy-typing' },
      { text: 'Performance', link: '/core/performance' },
    ],
  },
  {
    text: 'Spec patterns',
    collapsed: false,
    items: [{ text: 'Patterns that hold up', link: '/recipes' }],
  },
  {
    text: 'Runtimes',
    collapsed: false,
    items: [
      { text: 'Vitest', link: '/runtimes/vitest' },
      { text: 'Bun', link: '/runtimes/bun' },
      { text: 'Angular on Bun', link: '/runtimes/bun-angular' },
      { text: 'node:test', link: '/runtimes/node' },
      { text: 'Rstest', link: '/runtimes/rstest' },
      { text: 'RxJS', link: '/runtimes/rxjs' },
    ],
  },
  {
    text: 'Utilities',
    collapsed: false,
    items: [
      { text: 'Explaining a double', link: '/utilities/explain-spy' },
      { text: 'Console spies', link: '/utilities/console' },
      { text: 'Test-run hygiene', link: '/utilities/setup' },
      { text: 'Fake timers', link: '/utilities/fake-timers' },
      { text: 'Observer stubs', link: '/utilities/observer-stubs' },
      { text: 'Constructor doubles', link: '/utilities/constructor-doubles' },
      { text: 'Media element stub', link: '/utilities/media-element' },
      { text: 'Module mocks', link: '/utilities/module-mocks' },
      { text: 'Tracking injections', link: '/utilities/track-injections' },
      { text: 'Fixtures without casts', link: '/utilities/fixtures' },
      { text: 'fakeAsync on Vitest', link: '/utilities/zone' },
      { text: 'Waiting and the clock', link: '/utilities/event-loop' },
      { text: 'ESLint plugin', link: '/utilities/eslint-plugin' },
      { text: 'ESLint rules', link: '/utilities/eslint-rules' },
      { text: 'CLI — doctor & init', link: '/utilities/cli' },
      { text: 'CLI — the codemod', link: '/utilities/codemod' },
      { text: 'Editor diagnostics', link: '/utilities/editor-diagnostics' },
    ],
  },
  {
    text: 'Adapters',
    collapsed: false,
    items: [
      { text: 'Angular', link: '/adapters/angular' },
      { text: 'Angular HTTP', link: '/adapters/angular-http' },
      { text: 'Angular router', link: '/adapters/angular-router' },
      { text: 'Signal forms', link: '/adapters/signal-forms' },
      { text: 'Angular diagnostics', link: '/adapters/angular-diagnostics' },
      { text: 'Component provider overrides', link: '/adapters/angular-overrides' },
      { text: 'NestJS', link: '/adapters/nestjs' },
      { text: 'React', link: '/adapters/react' },
      { text: 'Vue / Pinia', link: '/adapters/vue' },
      { text: 'Svelte', link: '/adapters/svelte' },
    ],
  },
  {
    text: 'Upgrading',
    collapsed: false,
    items: [
      { text: 'To 5.0 — the Angular and rxjs peer floors', link: '/upgrading-5' },
      { text: 'To 4.0 — rxjs out of your program', link: '/upgrading-4' },
      { text: 'To 3.0 — the vitest peer range', link: '/upgrading-3' },
      { text: 'To 2.0 — additive methodsToSpyOn, lazy spies', link: '/upgrading-2' },
    ],
  },
  { text: 'Migrating from jest-auto-spies', link: '/migrating' },
  { text: 'Migrating from jasmine-auto-spies', link: '/migrating-jasmine' },
  { text: 'Migrating from @ngneat/spectator', link: '/migrating-spectator' },
  { text: 'Migrating from Suites', link: '/migrating-suites' },
  {
    text: 'Migrating from @testing-library/angular',
    link: '/migrating-testing-library-angular',
  },
  { text: 'After the refactor-jasmine-vitest schematic', link: '/migrating-angular-schematic' },
  { text: 'API reference', link: '/api' },
  { text: 'Comparison', link: '/comparison' },
  { text: 'For AI agents', link: '/agents' },
];

/** A sidebar `link` turned into the absolute URL the JSON-LD graphs and canonical tags need. */
function absolute(link: string): string {
  return `${HOSTNAME}${link.replace(/^\//, '')}`;
}

/** page link → the section it sits in (title + the group's first page), for the breadcrumb. */
type NavLike = { text: string; link?: string; items?: NavLike[]; collapsed?: boolean };

// The Russian sidebar is the English one with `/ru` in front of every path and every label looked
// up in RU_LABEL — one tree, so a page added to the English sidebar cannot go missing from the
// Russian one.
function toRussian(items: NavLike[]): NavLike[] {
  return items.map((item) => ({
    ...item,
    text: RU_LABEL[item.text] ?? item.text,
    ...(item.link?.startsWith('/') ? { link: `/ru${item.link}` } : {}),
    ...(item.items ? { items: toRussian(item.items) } : {}),
  }));
}

const RU_SIDEBAR = toRussian(SIDEBAR as NavLike[]);

const SECTION_OF_LINK = new Map<string, { text: string; first: string }>();

for (const entry of SIDEBAR) {
  if ('items' in entry) {
    for (const item of entry.items) {
      SECTION_OF_LINK.set(item.link, { text: entry.text, first: entry.items[0].link });
    }
  }
}

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'vitest-auto-spy',
  description:
    'Automatic, fully-typed test spies from a class — runtime-agnostic across Vitest, Bun, node:test and Rstest. A drop-in replacement for jest-auto-spies and jasmine-auto-spies.',

  // Served from https://asdalexey.github.io/vitest-auto-spy/ — required for asset/link paths.
  // If you add a custom domain (CNAME), change this to '/'.
  base: '/vitest-auto-spy/',

  lang: 'en-US',
  cleanUrls: true,
  lastUpdated: true,

  // Both locales are fully translated: `docs-site/ru/` holds a hand-written Russian page for every
  // English one, kept in step by `npm run ru:check`. Each page is therefore indexable in its own
  // right — self-canonical, in the sitemap, and paired with the other locale through hreflang.
  locales: {
    root: { label: 'English', lang: 'en-US' },
    ru: {
      label: 'Русский',
      lang: 'ru-RU',
      link: '/ru/',
      description:
        'Автоматические типизированные спаи из настоящего класса — одинаково на Vitest, Bun, node:test и Rstest. Замена jest-auto-spies и jasmine-auto-spies с кодмодом, который дописывает переезд.',
      themeConfig: {
        nav: [
          { text: 'Руководство', link: '/ru/core/introduction' },
          { text: 'Паттерны', link: '/ru/recipes' },
          { text: 'Среды запуска', link: '/ru/runtimes/vitest' },
          { text: 'Адаптеры', link: '/ru/adapters/angular' },
          { text: 'API', link: '/ru/api' },
          { text: 'Сравнение', link: '/ru/comparison' },
          { text: 'ИИ-агенты', link: '/ru/agents' },
        ],

        sidebar: RU_SIDEBAR,

        // The default theme ships English chrome and merges the locale over it, so anything not
        // named here — «On this page», «Previous page», «Appearance» — stays English on a page that
        // is otherwise fully translated.
        outline: { label: 'Содержание страницы' },
        docFooter: { prev: 'Предыдущая страница', next: 'Следующая страница' },
        darkModeSwitchLabel: 'Оформление',
        lightModeSwitchTitle: 'Переключить на светлую тему',
        darkModeSwitchTitle: 'Переключить на тёмную тему',
        sidebarMenuLabel: 'Меню',
        returnToTopLabel: 'Наверх',
        langMenuLabel: 'Сменить язык',
        skipToContentLabel: 'Перейти к содержимому',

        editLink: {
          pattern: 'https://github.com/ASDAlexey/vitest-auto-spy/edit/master/docs-site/:path',
          text: 'Предложить правку страницы',
        },

        lastUpdated: {
          text: 'Обновлено',
          formatOptions: { dateStyle: 'short', timeStyle: 'short' },
        },

        notFound: {
          title: 'СТРАНИЦА НЕ НАЙДЕНА',
          quote: 'Но если не сворачивать с пути, можно выйти куда-нибудь ещё.',
          linkLabel: 'на главную',
          linkText: 'Вернуться на главную',
        },

        footer: {
          message: 'Опубликовано под лицензией MIT.',
          copyright: 'Copyright © 2026 Alexey Popov',
        },
      },
    },
  },

  // README.md is the internal "how to run these docs" note, not a published page.
  srcExclude: ['README.md'],

  // Generates /sitemap.xml — submit it to Google Search Console so every page gets crawled.
  sitemap: {
    hostname: HOSTNAME,
  },

  // Site-wide SEO head tags (canonical + OG are added per-page in transformPageData below).
  head: [
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    [
      'link',
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700&family=JetBrains+Mono:wght@400;500&display=swap',
      },
    ],
    ['meta', { name: 'author', content: 'Alexey Popov' }],
    [
      'meta',
      {
        name: 'keywords',
        content:
          'vitest, auto spy, auto-spies, vitest-auto-spy, jest-auto-spies, test spies, typed mocks, ' +
          'why did my mock return undefined, calledWith not matching, which calledWith matched, ' +
          'spy called with wrong arguments, mock called but returned default, explainSpy, ' +
          'spy an existing object vitest, vi.mockObject alternative, sinon createStubInstance vitest, ' +
          'mock a real service instance, td.replace equivalent, createSpyFromInstance, ' +
          'expectEmission stack points at node_modules, test failure points at library not spec, ' +
          'node:test mock has no name, [Function: dispatch] node test, ' +
          'rxjs types in d.ts, cannot find module rxjs types, TS2307 rxjs, import type does not tree shake, ' +
          'Subject is not assignable, SubjectLike, ObservableLike, structural observable detection, ' +
          'stub IntersectionObserver vitest, ResizeObserver is not defined jsdom, HTMLMediaElement.play not implemented, ' +
          'localStorage is not defined vitest, localStorage.setItem is not a function, ' +
          'jsdom localStorage undefined, happy-dom localStorage missing, sessionStorage undefined vitest, ' +
          'node 25 localStorage vitest, node 26 web storage, restoreWebStorage, ' +
          'did the migration lose a test, compare two test runs, jest vs vitest test names diff, ' +
          'eslint plugin for vitest spies, done callback is deprecated use promise instead, ' +
          'what does this eslint rule mean, turn off one eslint rule, link to a lint rule doc, ' +
          'prefer-render-shallow, why is this rule a warning, eslint rule severity vitest spies, ' +
          'should create test is useless, ng generate spec only tests toBeTruthy, delete the default angular spec, ' +
          'no-redundant-smoke-test, test that cannot fail, smoke test asserts nothing, ' +
          'createSpyFromClass, createAutoMock, mockDeep, deep mock, createFixture, createFixtureFactory, ' +
          'resolveWith, calledWith, mustBeCalledWith, failWith, mockThrow, throw for specific arguments, nextWithValues, assertMocked, ' +
          'extendWithAutoSpies, test.extend fixtures, TestBed fixtures, vitest 4.1, detect-async-leaks, stray timers, onStrayTimers, no-bare-called-with, ' +
          'vitest 5, vitest 5 upgrade, does vitest-auto-spy work with vitest 5, auto spy vitest 5, ' +
          'All declarations of Matchers must have identical type parameters, TS2428, custom matcher types broken vitest 5, ' +
          'clearMocks true by default, clearAllMocks not clearing my spy, mock not cleared between tests vitest 5, ' +
          'spy still has calls from the previous test, toHaveBeenCalledTimes 0 after upgrade, ' +
          'strict mode, onUnstubbedCall, unstubbed call, fallbackMockImplementation, Symbol.dispose, using declaration, ' +
          'lazySpies, JavaScript heap out of memory, vitest out of memory, jest worker ran out of memory, ' +
          'mock memory leak, wide generated client, orval, ng-openapi-gen, ' +
          'vitest coverage slow, coverage.include slow, isIncluded, picomatch, custom coverage provider, ' +
          'customProviderModule, cobertura too large, gitlab coverage not showing, ' +
          'bun test, bun 1.4, angular on bun, node:test, angular testing, renderShallow, shallow rendering, zoneless, signal testing, ' +
          'assertComponentDefIntact, trackInjections, vi.resetAllMocks, isolate false shared environment, ' +
          'nestjs, react, vue, pinia, svelte, rxjs, eslint plugin, mocking, typescript, ' +
          'vitest mock class, mock interface typescript, replace jest-auto-spies, vitest auto spies, ' +
          'jest to vitest codemod, jest.Mock type arguments, migrate jest to vitest, ' +
          'jasmine-auto-spies, jasmine to vitest, karma to vitest, migrate jasmine, jasmine.createSpyObj, ' +
          'jasmine spyOn call through, withContext vitest, DEFAULT_TIMEOUT_INTERVAL, ' +
          'prefer-observer-stub, hand rolled IntersectionObserver stub, MutationObserver is not a constructor, ' +
          'mockValueProp only works in the first test, property mock stops applying, patch in beforeAll not reapplied, ' +
          'propsOutsideHooks, reportPropsOutsideHooks, registerAutoSpyDefaults, clearAutoSpyDefaults, ' +
          'same spy config repeated in every spec, default spy configuration per class, ' +
          'register spy defaults for many classes, AutoSpyDefaultEntry, bulk register spy defaults, ' +
          'component providers shadow TestBed provider, provideAutoSpy ignored by component, assertNoShadowedProviders, ' +
          'spy provided but real service used, no-private-member-access, no-dead-schemas, ' +
          'Spread syntax requires ...iterable[Symbol.iterator] to be a function, failed suites with no stack, ' +
          'test files failed but 0 tests failed, files fail to collect isolate false, Object.prototype pollution vitest, ' +
          'guardPrototypePollution, prototypePollution, hand written class double, no-stub-class-double, no-structural-double, ' +
          'not assignable to parameter of type HttpEvent, overloaded method mock wrong signature, ' +
          'prefer-render-shallow, TestBed.createComponent slow, angular component test slow, ' +
          'shallow render angular test, renderShallow, NO_ERRORS_SCHEMA vitest, ' +
          'webstorm eslint inspections, vs code extension, anti-patterns, spy typing, ' +
          'llms.txt, AGENTS.md, ai agent, claude code skill, openai codex, glm z.ai, cursor, copilot, gemini cli, ' +
          'setSpyEngine, getSpyEngine, spy engine, toHaveBeenCalledBefore not working, toHaveBeenCalledAfter wrong order, ' +
          'invocationCallOrder, vi.fn is slow, faster than vi.fn, mock creation overhead, custom mock function vitest, ' +
          'spectator, ngneat spectator, spectator angular 22, spectator alternative, spectator replacement, ' +
          'spectator not maintained, spectator deprecated, spectator 404, ngneat github deleted, openng spectator, ' +
          'createSpyObject, mockProvider, SpectatorService, createServiceFactory, createComponentFactory, SpyObject, ' +
          'Cannot find package @angular/platform-browser-dynamic, BrowserDynamicTestingModule, ' +
          'platform-browser-dynamic deprecated, ERR_MODULE_NOT_FOUND platform-browser-dynamic, ' +
          'spectator jquery dependency, spectator jasmine types in vitest, migrate off spectator, ' +
          'suites unit testing nestjs, @suites/unit, suites dev, TestBed.solitary, TestBed.sociable, unitRef, ' +
          'solitary unit test, sociable unit test, nestjs unit test without Test.createTestingModule, ' +
          'nestjs mock all dependencies, nestjs auto mock providers, nest service unit test vitest, ' +
          'nestjs testing module too slow, nest constructor changed test broke, mock nestjs injected service, ' +
          '@Inject token test, nestjs optional dependency test, nest property injection test, ' +
          'reflect-metadata emitDecoratorMetadata test, suites alternative, migrate off suites, ' +
          'fail test on console output, vitest fail on console.error, jest-fail-on-console vitest, ' +
          'console.error in test not failing, silence console in tests isolate false, onConsoleLog fail test, ' +
          'strayConsole, guardStrayConsole, console spy calls through, vi.spyOn console still prints, ' +
          'no-passthrough-console-spy, no-console-in-spec, no-import-time-console-spies, ' +
          'strict preset, fail on every warning, misconfiguration throw, onlyMethodsToSpyOn typo warning, ' +
          'where was this setTimeout scheduled, stray timer origin, describeStrayTimers, withoutStrayTimerTracking, ' +
          'no-mistyped-use-value, useValue is any, InjectionToken boolean useValue object, ' +
          'no-unknown-use-value-key, useValue key does not exist, useValue fixture unknown property, ' +
          'registerAutoSpyDefaults InjectionToken, spy defaults for a token, AutoSpyTokenDefaults, ' +
          'selfReturning, mockReturnThis on auto mock, chained call returns undefined, logger channel mock, ' +
          'no-instance-lifecycle-spy, spyOn ngOnInit not called, mockImplementation ngOnInit still runs, ' +
          'no-ts-expect-error-on-double, ts-expect-error nextWith, HttpEvent overload ts-ignore, ' +
          'no-constant-expect, expect(true).toBe(true), assertion that cannot fail, ' +
          'no-redundant-smoke-test, should create test useless, it should be created delete, smoke test beside real tests, ' +
          'no-compile-components, compileComponents no-op, inline templateUrl, ' +
          'mock ActivatedRoute, ActivatedRoute stub vitest, route.paramMap is undefined in test, snapshot params undefined, ' +
          'setRouteParam alternative, provideActivatedRoute, injectActivatedRoute, createActivatedRoute, ' +
          'stub child component angular, mock child component standalone, stub input renamed spec still green, ' +
          'createComponentStub, MockComponent alternative, ' +
          'mock localStorage vitest, localStorage leaks between tests, in-memory localStorage per test, stubWebStorage, ' +
          'getter returns undefined in test, observable property never emits, unconfiguredReads, onUnstubbedRead, ' +
          'mock Router angular test, router.url undefined in test, router events never emit, NavigationEnd in a test, ' +
          'provideRouterDouble, createRouterDouble, injectRouterDouble, navigate spy resolves true, routerLink href in test, ' +
          'router.currentNavigation is not a function, getCurrentNavigation returns null in test, mock currentNavigation angular, ' +
          'read navigation extras state in a test, how to fake a popstate navigation, setCurrentNavigation, ' +
          'currentNavigation signal angular 20, instanceMethodsToSpyOn currentNavigation, ' +
          'mock window vitest, window is read-only jsdom, cannot redefine window.location, location.reload is not a function, ' +
          'mock document angular, DOCUMENT token test, WINDOW token angular, provideWindowDouble, provideDocumentDouble, ' +
          'createWindowDouble, createDocumentDouble, override screen.width in test, ' +
          'mock MatDialogRef, MAT_DIALOG_DATA in a test, afterClosed never emits, dialog.close not called, ' +
          'material dialog unit test without material, provideMatDialogRef, provideMatDialogData, createMatDialogRef, injectMatDialogRef, ' +
          'angular signal forms testing, test a signal form, form() NG0203, NG0203 inject() must be called from an injection context, ' +
          'schema validation unit test angular, createForm, registerFormMatchers, toHaveFieldErrors, ' +
          'errors() toEqual fails, RequiredValidationError fieldTree, FieldTree in a test, ' +
          'change an input after the first render, componentRef.setInput in a test, NG0303 in a spec, setInputs, ' +
          'count signal recomputations, did the effect run again, trackRecomputations, trackEffectRuns, ' +
          'resource idle state test, mockResourceProp status idle, no-sync-testbed-await, prefer-provide-activated-route, ',
      },
    ],
    // max-image-preview:large is what lets Google and Yandex use the OG image in a result card.
    ['meta', { name: 'robots', content: 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1' }],
    // og:type is set per page in transformPageData (website on the landing, article everywhere else);
    // a global one here would be a duplicate tag on every page.
    // og:locale is set per page in transformPageData — the Russian landing needs ru_RU, and a
    // second tag here would contradict it rather than replace it.
    ['meta', { property: 'og:site_name', content: 'vitest-auto-spy' }],
    ['meta', { property: 'og:image', content: OG_IMAGE }],
    ['meta', { property: 'og:image:width', content: '1200' }],
    ['meta', { property: 'og:image:height', content: '630' }],
    ['meta', { property: 'og:image:alt', content: 'vitest-auto-spy — fully-typed test spies from a class, on Vitest, Bun, node:test and Rstest' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:image', content: OG_IMAGE }],
    ['link', { rel: 'icon', href: '/vitest-auto-spy/favicon.svg', type: 'image/svg+xml' }],
    // The default theme hides the language menu below 1280px, but the hamburger that also holds it
    // only appears below 960px — so between the two there is no way to switch language at all.
    ['style', {}, '@media (min-width: 960px) { .VPNavBarTranslations { display: flex !important; } }'],
    // The documentation as plain text, announced the way a feed is. An agent that honours the
    // convention takes one fetch instead of scraping the rendered HTML of thirty-six pages.
    ['link', { rel: 'alternate', type: 'text/plain', href: `${HOSTNAME}llms.txt`, title: 'llms.txt — documentation index for LLMs' }],
    ['link', { rel: 'alternate', type: 'text/plain', href: `${HOSTNAME}llms-full.txt`, title: 'llms-full.txt — the entire documentation' }],
    // JSON-LD structured data — helps Google show a rich result for the package.
    [
      'script',
      { type: 'application/ld+json' },
      JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'SoftwareSourceCode',
        name: 'vitest-auto-spy',
        description:
          'Auto-generate fully-typed test spies from a class across Vitest, Bun, node:test and Rstest. A drop-in replacement for jest-auto-spies and for jasmine-auto-spies, with a codemod that finishes the move.',
        codeRepository: 'https://github.com/ASDAlexey/vitest-auto-spy',
        programmingLanguage: 'TypeScript',
        license: 'https://opensource.org/licenses/MIT',
        author: { '@type': 'Person', name: 'Alexey Popov' },
        url: HOSTNAME,
      }),
    ],
    // A second graph, for the "what is this thing and what does it run on" question a search engine
    // answers in a knowledge panel and an assistant answers in a sentence. No ratings are claimed —
    // an invented aggregateRating is the fastest way to lose a rich result entirely.
    [
      'script',
      { type: 'application/ld+json' },
      JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'WebSite',
            '@id': `${HOSTNAME}#website`,
            name: 'vitest-auto-spy',
            url: HOSTNAME,
            inLanguage: 'en-US',
            publisher: { '@id': `${HOSTNAME}#author` },
          },
          {
            '@type': 'Person',
            '@id': `${HOSTNAME}#author`,
            name: 'Alexey Popov',
            url: 'https://github.com/ASDAlexey',
            sameAs: ['https://github.com/ASDAlexey', 'https://www.npmjs.com/~asdalexey'],
          },
          {
            '@type': 'SoftwareApplication',
            name: 'vitest-auto-spy',
            applicationCategory: 'DeveloperApplication',
            applicationSubCategory: 'Testing library',
            operatingSystem: 'Node.js, Bun, any browser test runner',
            softwareRequirements: 'Vitest >= 2.1, or bun test, or node --test, or rstest',
            downloadUrl: 'https://www.npmjs.com/package/vitest-auto-spy',
            installUrl: 'https://www.npmjs.com/package/vitest-auto-spy',
            license: 'https://opensource.org/licenses/MIT',
            author: { '@id': `${HOSTNAME}#author` },
            url: HOSTNAME,
            description:
              'Generate fully-typed test spies from a class, an interface or nothing at all. One API across Vitest, Bun, node:test and Rstest, with Angular, NestJS, React, Vue and Svelte recipes, RxJS observable spies and eighteen ESLint rules. A drop-in replacement for jest-auto-spies and for jasmine-auto-spies, whose .and / .calls / .withArgs namespaces it restores so a Karma-era suite runs before it is rewritten.',
            featureList: [
              'Typed spies generated from a class prototype',
              'createAutoMock<T>() — a mock from a type alone, no class required',
              'One mock adapter core across Vitest, bun:test, node:test and Rstest',
              'Angular TestBed helpers: provideAutoSpy, injectSpy, renderShallow',
              'Observable assertions that fail on silence',
              'Eighteen ESLint rules and editor diagnostics for WebStorm and VS Code',
              'createFixture / createFixtureFactory — a checked model stamped into a fresh copy per test',
              'A shared-double guard that puts back what a cross-file vi.resetAllMocks() dropped',
              'jasmine-auto-spies and Karma migration — the .and namespace restored, then a codemod that removes it',
            ],
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
          },
        ],
      }),
    ],
  ],

  // Per-page canonical, OG/Twitter tags and the BreadcrumbList JSON-LD, for correct indexing of
  // every page rather than of the landing alone.
  transformPageData(pageData) {
    const isRussian = pageData.relativePath.startsWith('ru/');
    const isHome = pageData.relativePath === 'index.md' || pageData.relativePath === 'ru/index.md';
    const path = pageData.relativePath.replace(/(index)?\.md$/, '');
    // Every page is a translation of its counterpart, so both are canonical for themselves and each
    // points at the other. `englishPath` stays around because the sidebar — and so the breadcrumb
    // section lookup — is keyed by the English link.
    const englishPath = isRussian ? path.replace(/^ru\//, '') : path;
    const canonical = `${HOSTNAME}${path}`;
    // The landing's own frontmatter title is the site name; suffixing it would double the name.
    const title = pageData.title && pageData.title !== SITE_NAME ? `${pageData.title} | ${SITE_NAME}` : SITE_NAME;
    const description = pageData.description || pageData.frontmatter['description'] || '';

    // The section a page sits in, looked up in the sidebar map above. Top-level pages (api,
    // comparison, …) sit in no section and get a one-step breadcrumb.
    const section = SECTION_OF_LINK.get(`/${englishPath}`);

    const crumbs: { name: string; item: string }[] = [
      { name: isRussian ? 'Главная' : 'Home', item: isRussian ? `${HOSTNAME}ru/` : HOSTNAME },
      ...(section
        ? [
            {
              name: isRussian ? (RU_LABEL[section.text] ?? section.text) : section.text,
              item: absolute(isRussian ? `/ru${section.first}` : section.first),
            },
          ]
        : []),
      { name: pageData.title || SITE_NAME, item: canonical },
    ];

    pageData.frontmatter['head'] ??= [];
    pageData.frontmatter['head'].push(
      ['link', { rel: 'canonical', href: canonical }],
      // Reciprocal on both sides and on every page — an hreflang set a crawler cannot confirm from
      // the other URL is one it drops, which is how a locale stops ranking in its own language.
      ['link', { rel: 'alternate', hreflang: 'en', href: `${HOSTNAME}${englishPath}` }],
      ['link', { rel: 'alternate', hreflang: 'ru', href: `${HOSTNAME}ru/${englishPath}` }],
      ['link', { rel: 'alternate', hreflang: 'x-default', href: `${HOSTNAME}${englishPath}` }],
      ['meta', { property: 'og:locale', content: isRussian ? 'ru_RU' : 'en_US' }],
      ['meta', { property: 'og:type', content: isHome ? 'website' : 'article' }],
      ['meta', { property: 'og:title', content: title }],
      ['meta', { property: 'og:description', content: description }],
      ['meta', { property: 'og:url', content: canonical }],
      ['meta', { name: 'twitter:title', content: title }],
      ['meta', { name: 'twitter:description', content: description }],
      // What the crawlers read as freshness. lastUpdated comes from git per page (lastUpdated: true).
      ...(pageData.lastUpdated && !isHome
        ? [['meta', { property: 'article:modified_time', content: new Date(pageData.lastUpdated).toISOString() }]]
        : []),
      // A breadcrumb trail in the result is worth more than any meta tag here, because it is the one
      // the engine can show: section names a flat URL does not carry. The section level links to the
      // first page of its group, which is where the sidebar sends a click too.
      ...(isHome
        ? []
        : [
            [
              'script',
              { type: 'application/ld+json' },
              JSON.stringify({
                '@context': 'https://schema.org',
                '@type': 'BreadcrumbList',
                itemListElement: crumbs.map((crumb, index) => ({
                  '@type': 'ListItem',
                  position: index + 1,
                  name: crumb.name,
                  item: crumb.item,
                })),
              }),
            ],
          ]),
    );
  },

  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Guide', link: '/core/introduction' },
      { text: 'Patterns', link: '/recipes' },
      { text: 'Runtimes', link: '/runtimes/vitest' },
      { text: 'Adapters', link: '/adapters/angular' },
      { text: 'API', link: '/api' },
      { text: 'Comparison', link: '/comparison' },
      { text: 'AI agents', link: '/agents' },
    ],

    sidebar: SIDEBAR,

    socialLinks: [{ icon: 'github', link: 'https://github.com/ASDAlexey/vitest-auto-spy' }],

    editLink: {
      pattern: 'https://github.com/ASDAlexey/vitest-auto-spy/edit/master/docs-site/:path',
    },

    search: {
      provider: 'local',
      options: {
        locales: {
          ru: {
            translations: {
              button: { buttonText: 'Поиск', buttonAriaLabel: 'Поиск' },
              modal: {
                displayDetails: 'Показать подробности',
                resetButtonTitle: 'Сбросить запрос',
                backButtonTitle: 'Закрыть поиск',
                noResultsText: 'Ничего не найдено',
                footer: {
                  selectText: 'выбрать',
                  navigateText: 'навигация',
                  closeText: 'закрыть',
                },
              },
            },
          },
        },
      },
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 Alexey Popov',
    },
  },
});
