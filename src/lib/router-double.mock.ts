import { NavigationEnd } from '@angular/router';

import type { RouterEventPair } from './router-double';

export const REPORT_MAP_OUTLETS = ['report', 'map'];

export const NAVIGATION_END_CHECKOUT: RouterEventPair = [NavigationEnd, '/checkout'];

export const SCROLL_ORIGIN: [number, number] = [0, 0];
