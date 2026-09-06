import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import { h } from 'vue';

import './custom.css';

// The hero is otherwise a column of text against an empty half-page. This is what the library does,
// in the four lines the tagline is describing — static markup, so it goes in through `innerHTML`
// rather than a component file the repo would need a Vue toolchain to format.
const HERO_PANEL = `
  <div class="vas-panel__bar"><span class="vas-panel__tab">user.service.spec.ts</span></div>
  <pre class="vas-panel__code"><code><span class="k">const</span> users = <span class="f">createSpyFromClass</span>(<span class="t">UserService</span>);

users.load.<span class="f">resolveWith</span>(user);
users.save.<span class="f">rejectWith</span>(<span class="k">new</span> <span class="t">HttpError</span>(<span class="n">409</span>));

users.load.<span class="f">mustBeCalledWith</span>(<span class="n">7</span>);</code></pre>
  <div class="vas-panel__out">
    <span class="vas-panel__pass">✓ 3 passed</span>
    <span class="vas-panel__dim">no casts · no vi.fn() kept in sync by hand</span>
  </div>
`;

export default {
  extends: DefaultTheme,
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      'home-hero-image': () => h('div', { class: 'vas-panel', innerHTML: HERO_PANEL }),
    }),
} satisfies Theme;
