import { defineConfig } from 'vitepress';

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'vitest-auto-spy',
  description:
    'Automatic, fully-typed test spies from a class — runtime-agnostic across Vitest, Bun and node:test.',

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
