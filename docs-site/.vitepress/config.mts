import { defineConfig } from 'vitepress';

const HOSTNAME = 'https://asdalexey.github.io/vitest-auto-spy/';
const OG_IMAGE = `${HOSTNAME}og-image.png`;

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'vitest-auto-spy',
  description:
    'Automatic, fully-typed test spies from a class — runtime-agnostic across Vitest, Bun and node:test.',

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
          'createSpyFromClass, createAutoMock, bun test, node:test, angular testing, nestjs, react, vue, svelte, rxjs, mocking, typescript',
      },
    ],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'vitest-auto-spy' }],
    ['meta', { property: 'og:image', content: OG_IMAGE }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:image', content: OG_IMAGE }],
    ['link', { rel: 'icon', href: '/vitest-auto-spy/favicon.svg', type: 'image/svg+xml' }],
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
  ],

  // Per-page canonical + OG title/description/url for correct indexing of every page.
  transformPageData(pageData) {
    const path = pageData.relativePath.replace(/(index)?\.md$/, '');
    const canonical = `${HOSTNAME}${path}`;
    const title = pageData.title ? `${pageData.title} | vitest-auto-spy` : 'vitest-auto-spy';
    const description = pageData.description || pageData.frontmatter.description || '';

    pageData.frontmatter.head ??= [];
    pageData.frontmatter.head.push(
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
      { text: 'Runtimes', link: '/runtimes/vitest' },
      { text: 'Adapters', link: '/adapters/angular' },
      { text: 'API', link: '/api' },
      { text: 'Comparison', link: '/comparison' },
    ],

    sidebar: [
      {
        text: 'Core',
        collapsed: false,
        items: [
          { text: 'Introduction', link: '/core/introduction' },
          { text: 'Installation', link: '/core/installation' },
          { text: 'createSpyFromClass', link: '/core/create-spy-from-class' },
          { text: 'Control helpers', link: '/core/control-helpers' },
          { text: 'Auto-mock by type', link: '/core/auto-mock-by-type' },
        ],
      },
      {
        text: 'Runtimes',
        collapsed: false,
        items: [
          { text: 'Vitest', link: '/runtimes/vitest' },
          { text: 'Bun', link: '/runtimes/bun' },
          { text: 'node:test', link: '/runtimes/node' },
          { text: 'RxJS', link: '/runtimes/rxjs' },
        ],
      },
      {
        text: 'Utilities',
        collapsed: false,
        items: [{ text: 'Console spies', link: '/utilities/console' }],
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
