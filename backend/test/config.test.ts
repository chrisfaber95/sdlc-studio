import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config.ts';

describe('loadConfig', () => {
  it('defaults to loopback', () => {
    expect(loadConfig({}).host).toBe('127.0.0.1');
  });

  it('refuses wildcard binds unless explicitly allowed', () => {
    expect(() => loadConfig({ SDLC_HOST: '0.0.0.0' })).toThrow(ConfigError);
    expect(() => loadConfig({ SDLC_HOST: '::' })).toThrow(ConfigError);
    expect(loadConfig({ SDLC_HOST: '0.0.0.0', SDLC_ALLOW_WILDCARD_BIND: '1' }).host).toBe('0.0.0.0');
  });

  it('accepts a tailnet address, parses owners and router settings', () => {
    const c = loadConfig({
      SDLC_HOST: '100.64.0.1',
      SDLC_PORT: '9000',
      SDLC_OWNER_IDENTITIES: 'Chris@Example.com, other@example.com',
      SDLC_ROUTER_URL: 'http://r:1/',
      SDLC_ROUTER_TOKEN: 't',
    });
    expect(c).toMatchObject({ host: '100.64.0.1', port: 9000, routerBaseUrl: 'http://r:1', routerToken: 't' });
    expect(c.ownerIdentities).toEqual(['chris@example.com', 'other@example.com']);
  });

  it('rejects a bad port', () => {
    expect(() => loadConfig({ SDLC_PORT: 'abc' })).toThrow(ConfigError);
  });
});
