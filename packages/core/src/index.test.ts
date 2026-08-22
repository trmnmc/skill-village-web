import { describe, it, expect } from 'vitest';
import { CORE_VERSION } from './index.js';

describe('core package', () => {
  it('exposes a version marker so the toolchain is proven end to end', () => {
    expect(CORE_VERSION).toBe('0.1.0');
  });
});
