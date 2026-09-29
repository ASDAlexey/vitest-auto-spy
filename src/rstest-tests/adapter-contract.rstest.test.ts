import { describe, it } from '@rstest/core';

import { getMockAdapter } from '../lib/mock-adapter';
import { describeMockAdapterContract } from '../lib/mock-adapter-contract';
import '../rstest';

describeMockAdapterContract({ describe, it }, { name: 'Rstest', adapter: getMockAdapter });
describeMockAdapterContract({ describe, it }, { name: "Rstest, 'runner' engine", adapter: getMockAdapter, engine: 'runner' });
