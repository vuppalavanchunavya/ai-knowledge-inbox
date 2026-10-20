import { describe, expect, it } from 'vitest';
import { isBlockedAddress, parsePublicHttpUrl } from '../src/services/ssrf.js';
import { AppError } from '../src/utils/errors.js';
import { createWebpage, sampleWebpage } from './helpers.js';

describe('SSRF protection', () => {
  it.each([
    'http://127.0.0.1/admin',
    'http://localhost/secret',
    'http://2130706433/',
    'http://0177.0.0.1/',
    'http://0x7f000001/',
    'http://192.168.1.20/router',
    'http://10.0.0.8/',
    'http://169.254.169.254/latest/meta-data',
    'http://[::1]/',
    'http://[fc00::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://metadata.google.internal/',
    'http://app.local/internal',
    'ftp://example.com/file',
    'http://user:pass@example.com/',
    'not a url',
  ])('rejects %s', (input) => {
    expect(() => parsePublicHttpUrl(input)).toThrow(AppError);
  });

  it('blocks private addresses discovered through DNS and redirects', async () => {
    const requested: string[] = [];
    const webpage = createWebpage(async (request) => {
      requested.push(request.url.hostname);
      expect(request.address).toBe('93.184.216.34');
      if (request.url.hostname === 'redirect.example') {
        return {
          status: 302,
          headers: { location: 'http://127.0.0.1/secret' },
          body: Buffer.alloc(0),
        };
      }
      return {
        status: 200,
        headers: { 'content-type': 'text/plain' },
        body: Buffer.from('Public page text.'),
      };
    });

    await expect(webpage.fetchReadable('http://private.example/hidden')).rejects.toMatchObject({
      code: 'UNSAFE_URL',
    });
    await expect(webpage.fetchReadable('http://redirect.example/start')).rejects.toMatchObject({
      code: 'UNSAFE_URL',
    });
    expect(requested).toEqual(['redirect.example']);
    expect(isBlockedAddress('10.1.2.3')).toBe(true);
    expect(isBlockedAddress('93.184.216.34')).toBe(false);
  });

  it('follows a redirect only after the destination is public', async () => {
    const webpage = createWebpage(async (request) => {
      if (request.url.pathname === '/start') {
        return {
          status: 302,
          headers: { location: '/final' },
          body: Buffer.alloc(0),
        };
      }
      return {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        body: Buffer.from('<html><head><title>Final</title></head><body><p>Reached the final page.</p></body></html>'),
      };
    });
    const page = await webpage.fetchReadable('http://public.example/start');
    expect(page.finalUrl).toBe('http://public.example/final');
    expect(page.text).toContain('Reached the final page.');
  });
});

describe('webpage extraction', () => {
  it('extracts readable article text and rejects unsupported or empty pages', async () => {
    const page = await sampleWebpage().fetchReadable('https://public.example/hooks');
    expect(page.title).toBe('Hooks Guide');
    expect(page.text).toContain('React Hooks allow functional components to use state');
    expect(page.text).not.toContain('secretScriptToken');

    const unsupported = createWebpage(async () => ({
      status: 200,
      headers: { 'content-type': 'application/pdf' },
      body: Buffer.from('%PDF'),
    }));
    await expect(unsupported.fetchReadable('https://public.example/file.pdf')).rejects.toMatchObject({
      statusCode: 415,
      code: 'UNSUPPORTED_CONTENT_TYPE',
    });

    const empty = createWebpage(async () => ({
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: Buffer.from('<html><head><title>Empty</title></head><body> </body></html>'),
    }));
    await expect(empty.fetchReadable('https://public.example/empty')).rejects.toMatchObject({
      code: 'NO_READABLE_CONTENT',
    });
  });
});
