import { defineConfig } from 'vitepress';

const HOSTNAME = 'https://asdalexey.github.io/vitest-auto-spy/';
const OG_IMAGE = `${HOSTNAME}og-image.png`;

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'vitest-auto-spy',
  description: 'Automatic, fully-typed test spies from a class — runtime-agnostic across Vitest, Bun and node:test.',

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
          'createSpyFromClass, createAutoMock, mockDeep, deep mock, resolveWith, calledWith, mustBeCalledWith, ' +
          'bun test, bun 1.4, angular on bun, node:test, angular testing, renderShallow, shallow rendering, zoneless, signal testing, ' +
          'nestjs, react, vue, pinia, svelte, rxjs, eslint plugin, mocking, typescript, ' +
          'vitest mock class, mock interface typescript, replace jest-auto-spies, vitest auto spies, ' +
          'webstorm eslint inspections, vs code extension, anti-patterns, spy typing, ' +
          'llms.txt, AGENTS.md, ai agent, claude code skill, openai codex, glm z.ai, cursor, copilot, gemini cli',
      },
    ],
    // max-image-preview:large is what lets Google and Yandex use the OG image in a result card.
    ['meta', { name: 'robots', content: 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1' }],
    ['meta', { property: 'og:type', content: 'website' }],
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
          'Auto-generate fully-typed test spies from a class across Vitest, Bun and node:test. A drop-in replacement for jest-auto-spies.',
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
              'Generate fully-typed test spies from a class, an interface or nothing at all. One API across Vitest, Bun and node:test, with Angular, NestJS, React, Vue and Svelte recipes, RxJS observable spies and eleven ESLint rules. A drop-in replacement for jest-auto-spies.',
            featureList: [
              'Typed spies generated from a class prototype',
              'createAutoMock<T>() — a mock from a type alone, no class required',
              'One mock adapter core across Vitest, bun:test and node:test',
              'Angular TestBed helpers: provideAutoSpy, injectSpy, renderShallow',
              'Observable assertions that fail on silence',
              'Eleven ESLint rules and editor diagnostics for WebStorm and VS Code',
            ],
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
          },
        ],
      }),
    ],
  ],

  // Per-page canonical + OG title/description/url for correct indexing of every page.
  transformPageData(pageData) {
    const path = pageData.relativePath.replace(/(index)?\.md$/, '');
    const canonical = `${HOSTNAME}${path}`;
    const title = pageData.title ? `${pageData.title} | vitest-auto-spy` : 'vitest-auto-spy';
    const description = pageData.description || pageData.frontmatter['description'] || '';

    pageData.frontmatter['head'] ??= [];
    pageData.frontmatter['head'].push(
      ['link', { rel: 'canonical', href: canonical }],
      ['meta', { property: 'og:title', content: title }],
      ['meta', { property: 'og:description', content: description }],
      ['meta', { property: 'og:url', content: canonical }],
      ['meta', { name: 'twitter:title', content: title }],
      ['meta', { name: 'twitter:description', content: description }],
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

    sidebar: [
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
          { text: 'Fixtures without casts', link: '/utilities/fixtures' },
          { text: 'fakeAsync on Vitest', link: '/utilities/zone' },
          { text: 'Waiting and the clock', link: '/utilities/event-loop' },
          { text: 'ESLint plugin', link: '/utilities/eslint-plugin' },
          { text: 'Editor diagnostics', link: '/utilities/editor-diagnostics' },
        ],
      },
      {
        text: 'Adapters',
        collapsed: false,
        items: [
          { text: 'Angular', link: '/adapters/angular' },
          { text: 'NestJS', link: '/adapters/nestjs' },
          { text: 'React', link: '/adapters/react' },
          { text: 'Vue / Pinia', link: '/adapters/vue' },
          { text: 'Svelte', link: '/adapters/svelte' },
        ],
      },
      { text: 'Migrating from jest-auto-spies', link: '/migrating' },
      { text: 'API reference', link: '/api' },
      { text: 'Comparison', link: '/comparison' },
      { text: 'For AI agents', link: '/agents' },
    ],

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
