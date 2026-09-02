import { defineConfig } from 'vitepress';

const HOSTNAME = 'https://asdalexey.github.io/vitest-auto-spy/';
const OG_IMAGE = `${HOSTNAME}og-image.png`;
const SITE_NAME = 'vitest-auto-spy';

// The sidebar doubles as the source the per-page BreadcrumbList JSON-LD is built from (see
// transformPageData), so it is hoisted here rather than living inside themeConfig.
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
      { text: 'RxJS', link: '/runtimes/rxjs' },
    ],
  },
  {
    text: 'Utilities',
    collapsed: false,
    items: [
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
      { text: 'Angular diagnostics', link: '/adapters/angular-diagnostics' },
      { text: 'Component provider overrides', link: '/adapters/angular-overrides' },
      { text: 'NestJS', link: '/adapters/nestjs' },
      { text: 'React', link: '/adapters/react' },
      { text: 'Vue / Pinia', link: '/adapters/vue' },
      { text: 'Svelte', link: '/adapters/svelte' },
    ],
  },
  { text: 'Migrating from jest-auto-spies', link: '/migrating' },
  { text: 'Migrating from jasmine-auto-spies', link: '/migrating-jasmine' },
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
    'Automatic, fully-typed test spies from a class — runtime-agnostic across Vitest, Bun and node:test. A drop-in replacement for jest-auto-spies and jasmine-auto-spies.',

  // Served from https://asdalexey.github.io/vitest-auto-spy/ — required for asset/link paths.
  // If you add a custom domain (CNAME), change this to '/'.
  base: '/vitest-auto-spy/',

  lang: 'en-US',
  cleanUrls: true,
  lastUpdated: true,

  // README.md is the internal "how to run these docs" note, not a published page.
  srcExclude: ['README.md'],

  // Generates /sitemap.xml — submit it to Google Search Console so every page gets crawled.
  sitemap: {
    hostname: HOSTNAME,
  },

  // Site-wide SEO head tags (canonical + OG are added per-page in transformPageData below).
  head: [
    ['meta', { name: 'author', content: 'Alexey Popov' }],
    [
      'meta',
      {
        name: 'keywords',
        content:
          'vitest, auto spy, auto-spies, vitest-auto-spy, jest-auto-spies, test spies, typed mocks, ' +
          'createSpyFromClass, createAutoMock, mockDeep, deep mock, createFixture, createFixtureFactory, ' +
          'resolveWith, calledWith, mustBeCalledWith, failWith, mockThrow, throw for specific arguments, nextWithValues, assertMocked, ' +
          'extendWithAutoSpies, test.extend fixtures, TestBed fixtures, vitest 4.1, detect-async-leaks, stray timers, onStrayTimers, no-bare-called-with, ' +
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
          'webstorm eslint inspections, vs code extension, anti-patterns, spy typing, ' +
          'llms.txt, AGENTS.md, ai agent, claude code skill, openai codex, glm z.ai, cursor, copilot, gemini cli',
      },
    ],
    // max-image-preview:large is what lets Google and Yandex use the OG image in a result card.
    ['meta', { name: 'robots', content: 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1' }],
    // og:type is set per page in transformPageData (website on the landing, article everywhere else);
    // a global one here would be a duplicate tag on every page.
    ['meta', { property: 'og:locale', content: 'en_US' }],
    ['meta', { property: 'og:site_name', content: 'vitest-auto-spy' }],
    ['meta', { property: 'og:image', content: OG_IMAGE }],
    ['meta', { property: 'og:image:width', content: '1200' }],
    ['meta', { property: 'og:image:height', content: '630' }],
    ['meta', { property: 'og:image:alt', content: 'vitest-auto-spy — fully-typed test spies from a class, on Vitest, Bun and node:test' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:image', content: OG_IMAGE }],
    ['link', { rel: 'icon', href: '/vitest-auto-spy/favicon.svg', type: 'image/svg+xml' }],
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
          'Auto-generate fully-typed test spies from a class across Vitest, Bun and node:test. A drop-in replacement for jest-auto-spies and for jasmine-auto-spies, with a codemod that finishes the move.',
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
            softwareRequirements: 'Vitest >= 2.1, or bun test, or node --test',
            downloadUrl: 'https://www.npmjs.com/package/vitest-auto-spy',
            installUrl: 'https://www.npmjs.com/package/vitest-auto-spy',
            license: 'https://opensource.org/licenses/MIT',
            author: { '@id': `${HOSTNAME}#author` },
            url: HOSTNAME,
            description:
              'Generate fully-typed test spies from a class, an interface or nothing at all. One API across Vitest, Bun and node:test, with Angular, NestJS, React, Vue and Svelte recipes, RxJS observable spies and eighteen ESLint rules. A drop-in replacement for jest-auto-spies and for jasmine-auto-spies, whose .and / .calls / .withArgs namespaces it restores so a Karma-era suite runs before it is rewritten.',
            featureList: [
              'Typed spies generated from a class prototype',
              'createAutoMock<T>() — a mock from a type alone, no class required',
              'One mock adapter core across Vitest, bun:test and node:test',
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
    const isHome = pageData.relativePath === 'index.md';
    const path = pageData.relativePath.replace(/(index)?\.md$/, '');
    const canonical = `${HOSTNAME}${path}`;
    // The landing's own frontmatter title is the site name; suffixing it would double the name.
    const title = pageData.title && pageData.title !== SITE_NAME ? `${pageData.title} | ${SITE_NAME}` : SITE_NAME;
    const description = pageData.description || pageData.frontmatter['description'] || '';

    // The section a page sits in, looked up in the sidebar map above. Top-level pages (api,
    // comparison, …) sit in no section and get a one-step breadcrumb.
    const section = SECTION_OF_LINK.get(`/${path}`);

    const crumbs: { name: string; item: string }[] = [
      { name: 'Home', item: HOSTNAME },
      ...(section ? [{ name: section.text, item: absolute(section.first) }] : []),
      { name: pageData.title || SITE_NAME, item: canonical },
    ];

    pageData.frontmatter['head'] ??= [];
    pageData.frontmatter['head'].push(
      ['link', { rel: 'canonical', href: canonical }],
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
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 Alexey Popov',
    },
  },
});
