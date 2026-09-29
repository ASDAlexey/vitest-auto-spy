import { describe, it } from 'node:test';

import { getMockAdapter } from '../lib/mock-adapter';
import { describeMockAdapterContract } from '../lib/mock-adapter-contract';
import '../node';

describeMockAdapterContract({ describe, it }, { name: 'node:test', adapter: getMockAdapter });
