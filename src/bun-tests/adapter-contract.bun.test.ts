import { describe, it } from 'bun:test';

import '../bun';
import { getMockAdapter } from '../lib/mock-adapter';
import { describeMockAdapterContract } from '../lib/mock-adapter-contract';

describeMockAdapterContract({ describe, it }, { name: 'bun:test', adapter: getMockAdapter });
