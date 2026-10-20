import { BlockList, isIP } from 'node:net';
import { AppError } from '../utils/errors.js';

const blockList = new BlockList();

for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blockList.addSubnet(network, prefix, 'ipv4');
}

blockList.addAddress('::', 'ipv6');
blockList.addAddress('::1', 'ipv6');
blockList.addSubnet('fc00::', 7, 'ipv6');
blockList.addSubnet('fe80::', 10, 'ipv6');
blockList.addSubnet('ff00::', 8, 'ipv6');
blockList.addSubnet('2001:db8::', 32, 'ipv6');

const BLOCKED_HOSTS = new Set(['localhost', 'localhost.localdomain', 'metadata.google.internal']);

export function bareHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
}

function mappedIpv4(address: string): string | null {
  if (!address.startsWith('::ffff:')) {
    return null;
  }
  const rest = address.slice('::ffff:'.length);
  if (isIP(rest) === 4) {
    return rest;
  }
  const parts = rest.split(':');
  if (parts.length !== 2 || parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) {
    return null;
  }
  const high = Number.parseInt(parts[0], 16);
  const low = Number.parseInt(parts[1], 16);
  return [((high >> 8) & 255), (high & 255), ((low >> 8) & 255), (low & 255)].join('.');
}

export function isBlockedAddress(address: string): boolean {
  const normalized = bareHostname(address);
  const mapped = mappedIpv4(normalized);
  if (mapped) {
    return blockList.check(mapped, 'ipv4');
  }
  const family = isIP(normalized);
  if (family === 4) {
    return blockList.check(normalized, 'ipv4');
  }
  if (family === 6) {
    return blockList.check(normalized, 'ipv6');
  }
  return true;
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (!host || BLOCKED_HOSTS.has(host)) {
    return true;
  }
  if (host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return true;
  }
  if (/^\d+$/.test(host)) {
    return true;
  }
  return false;
}

export function parsePublicHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new AppError(400, 'INVALID_URL', 'Enter a valid HTTP or HTTPS URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new AppError(400, 'INVALID_URL', 'Only HTTP and HTTPS URLs can be saved.');
  }
  if (url.username || url.password) {
    throw new AppError(400, 'UNSAFE_URL', 'URLs with embedded credentials are not allowed.');
  }
  const hostname = bareHostname(url.hostname);
  if (isBlockedHostname(hostname)) {
    throw new AppError(400, 'UNSAFE_URL', 'That URL points to a blocked or local address.');
  }
  if (isIP(hostname) && isBlockedAddress(hostname)) {
    throw new AppError(400, 'UNSAFE_URL', 'That URL points to a blocked or local address.');
  }
  if (isIP(hostname) === 0 && /^(?:0x[0-9a-f]+|\d+)$/i.test(hostname)) {
    throw new AppError(400, 'UNSAFE_URL', 'That URL points to a blocked or local address.');
  }
  return url;
}

export function assertPublicAddresses(addresses: string[]): void {
  if (addresses.length === 0) {
    throw new AppError(400, 'UNSAFE_URL', 'The URL could not be resolved to a public address.');
  }
  for (const address of addresses) {
    if (isBlockedAddress(address)) {
      throw new AppError(400, 'UNSAFE_URL', 'That URL resolves to a blocked or local address.');
    }
  }
}
