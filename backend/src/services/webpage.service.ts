import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { normalizeText } from '../utils/text.js';
import { assertPublicAddresses, bareHostname, parsePublicHttpUrl } from './ssrf.js';

export interface ResolvedAddress {
  address: string;
  family: number;
}

export interface PageRequest {
  url: URL;
  address: string;
  family: number;
  timeoutMs: number;
  maxBytes: number;
}

export interface PageResponse {
  status: number;
  headers: Record<string, string | undefined>;
  body: Buffer;
}

export type HostResolver = (hostname: string) => Promise<ResolvedAddress[]>;
export type PageRequester = (request: PageRequest) => PageResponse | Promise<PageResponse>;

const ALLOWED_TYPES = new Set(['text/html', 'application/xhtml+xml', 'text/plain']);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export function extractReadableContent(html: string, pageUrl: string): { title: string; text: string } {
  const dom = new JSDOM(html, { url: pageUrl });
  const document = dom.window.document;
  const article = new Readability(document).parse();
  const title = (article?.title || document.title || '').trim();
  let text = article?.textContent?.trim() ?? '';
  if (!text) {
    document.querySelectorAll('script, style, noscript, nav, footer, svg').forEach((node) => node.remove());
    text = document.body?.textContent ?? '';
  }
  return { title, text: normalizeText(text) };
}

export class WebpageService {
  private readonly maxRedirects: number;

  constructor(
    private readonly options: {
      resolveHost: HostResolver;
      request: PageRequester;
      timeoutMs: number;
      maxBytes: number;
      maxRedirects?: number;
    },
  ) {
    this.maxRedirects = options.maxRedirects ?? 5;
  }

  async fetchReadable(rawUrl: string): Promise<{ title: string; text: string; finalUrl: string }> {
    let current = parsePublicHttpUrl(rawUrl);
    const seen = new Set<string>();
    logger.info('url.fetch.started', { host: bareHostname(current.hostname) });

    for (let hop = 0; hop <= this.maxRedirects; hop += 1) {
      const key = current.href;
      if (seen.has(key)) {
        throw new AppError(422, 'PAGE_UNAVAILABLE', 'The page redirected in a loop.');
      }
      seen.add(key);

      const resolved = await this.resolve(bareHostname(current.hostname));
      assertPublicAddresses(resolved.map((entry) => entry.address));
      const target = resolved[0];
      let response: PageResponse;
      try {
        response = await this.options.request({
          url: current,
          address: target.address,
          family: target.family,
          timeoutMs: this.options.timeoutMs,
          maxBytes: this.options.maxBytes,
        });
      } catch (error) {
        if (error instanceof AppError) {
          throw error;
        }
        logger.error('url.fetch.failed', { host: bareHostname(current.hostname), code: 'FETCH_FAILED' });
        throw new AppError(502, 'FETCH_FAILED', 'The page could not be reached.');
      }

      if (response.body.length > this.options.maxBytes) {
        throw new AppError(413, 'RESPONSE_TOO_LARGE', 'The page is larger than the allowed size.');
      }

      if (REDIRECT_STATUSES.has(response.status)) {
        const location = headerValue(response.headers, 'location');
        if (!location) {
          throw new AppError(422, 'PAGE_UNAVAILABLE', 'The page redirected without a destination.');
        }
        let next: URL;
        try {
          next = new URL(location, current);
        } catch {
          throw new AppError(422, 'PAGE_UNAVAILABLE', 'The page redirected to an invalid destination.');
        }
        current = parsePublicHttpUrl(next.href);
        continue;
      }

      if (response.status < 200 || response.status >= 300) {
        logger.info('url.fetch.completed', { host: bareHostname(current.hostname), status: response.status });
        throw new AppError(422, 'PAGE_UNAVAILABLE', `The page returned HTTP ${response.status}.`);
      }

      const mediaType = (headerValue(response.headers, 'content-type') ?? '').split(';')[0].trim().toLowerCase();
      if (!ALLOWED_TYPES.has(mediaType)) {
        throw new AppError(415, 'UNSUPPORTED_CONTENT_TYPE', 'Only HTML and plain-text pages can be saved.');
      }

      const decoded = decodeBody(response.body, headerValue(response.headers, 'content-type') ?? '');
      const extracted =
        mediaType === 'text/plain'
          ? { title: bareHostname(current.hostname), text: normalizeText(decoded) }
          : extractReadableContent(decoded, current.href);

      if (!extracted.text) {
        throw new AppError(422, 'NO_READABLE_CONTENT', 'The page did not contain readable text.');
      }

      logger.info('url.fetch.completed', {
        host: bareHostname(current.hostname),
        status: response.status,
        bytes: response.body.length,
      });
      return {
        title: extracted.title || bareHostname(current.hostname),
        text: extracted.text,
        finalUrl: current.href,
      };
    }

    throw new AppError(422, 'PAGE_UNAVAILABLE', 'The page redirected too many times.');
  }

  private async resolve(hostname: string): Promise<ResolvedAddress[]> {
    if (isIP(hostname)) {
      const family = isIP(hostname);
      return [{ address: hostname, family }];
    }
    try {
      return await this.options.resolveHost(hostname);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(422, 'PAGE_UNAVAILABLE', 'The page hostname could not be resolved.');
    }
  }
}

function headerValue(headers: Record<string, string | undefined>, name: string): string | undefined {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return entry?.[1];
}

function decodeBody(body: Buffer, contentType: string): string {
  const charsetMatch = /charset=([^;]+)/i.exec(contentType);
  const charset = charsetMatch?.[1]?.trim().replace(/"/g, '').toLowerCase() ?? 'utf-8';
  if (charset !== 'utf-8' && charset !== 'utf8' && charset !== 'us-ascii') {
    throw new AppError(415, 'UNSUPPORTED_CONTENT_TYPE', 'Only UTF-8 pages can be saved.');
  }
  return body.toString('utf8');
}

export function createDefaultHostResolver(): HostResolver {
  return async (hostname: string) => {
    const records = await lookup(hostname, { all: true, verbatim: true });
    return records.map((record) => ({ address: record.address, family: record.family }));
  };
}

export function createPinnedRequester(): PageRequester {
  return (pageRequest) =>
    new Promise((resolve, reject) => {
      let settled = false;
      const fail = (error: AppError): void => {
        if (settled) {
          return;
        }
        settled = true;
        reject(error);
      };
      const succeed = (value: PageResponse): void => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(value);
      };
      const lib = pageRequest.url.protocol === 'https:' ? httpsRequest : httpRequest;
      const port = pageRequest.url.port
        ? Number(pageRequest.url.port)
        : pageRequest.url.protocol === 'https:'
          ? 443
          : 80;
      const req = lib(
        {
          protocol: pageRequest.url.protocol,
          hostname: pageRequest.address,
          family: pageRequest.family,
          port,
          method: 'GET',
          path: `${pageRequest.url.pathname}${pageRequest.url.search}`,
          headers: {
            Host: pageRequest.url.host,
            'User-Agent': 'AIKnowledgeInbox/1.0',
            Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9',
            'Accept-Encoding': 'identity',
          },
          servername: bareHostname(pageRequest.url.hostname),
          timeout: pageRequest.timeoutMs,
        },
        (response) => {
          const chunks: Buffer[] = [];
          let received = 0;
          response.on('data', (chunk: Buffer) => {
            received += chunk.length;
            if (received > pageRequest.maxBytes) {
              response.destroy();
              req.destroy();
              fail(new AppError(413, 'RESPONSE_TOO_LARGE', 'The page is larger than the allowed size.'));
              return;
            }
            chunks.push(chunk);
          });
          response.on('end', () => {
            const headers: Record<string, string> = {};
            for (const [key, value] of Object.entries(response.headers)) {
              if (typeof value === 'string') {
                headers[key] = value;
              } else if (Array.isArray(value)) {
                headers[key] = value.join(', ');
              }
            }
            succeed({
              status: response.statusCode ?? 0,
              headers,
              body: Buffer.concat(chunks),
            });
          });
          response.on('error', () => {
            fail(new AppError(502, 'FETCH_FAILED', 'The page could not be reached.'));
          });
        },
      );
      req.on('timeout', () => {
        req.destroy();
        fail(new AppError(502, 'FETCH_TIMEOUT', 'The page took too long to respond.'));
      });
      req.on('error', () => {
        fail(new AppError(502, 'FETCH_FAILED', 'The page could not be reached.'));
      });
      req.end();
    });
}
