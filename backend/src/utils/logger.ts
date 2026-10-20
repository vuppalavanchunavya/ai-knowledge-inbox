import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestStore {
  requestId: string;
}

export const requestStore = new AsyncLocalStorage<RequestStore>();

export function currentRequestId(): string | undefined {
  return requestStore.getStore()?.requestId;
}

type LogFields = Record<string, string | number | boolean | null | undefined>;

function write(level: 'info' | 'error', event: string, fields: LogFields = {}): void {
  if (process.env.VITEST) {
    return;
  }
  const payload = {
    time: new Date().toISOString(),
    level,
    event,
    requestId: currentRequestId() ?? null,
    ...fields,
  };
  const line = JSON.stringify(payload);
  if (level === 'error') {
    console.error(line);
    return;
  }
  console.log(line);
}

export const logger = {
  info(event: string, fields?: LogFields): void {
    write('info', event, fields);
  },
  error(event: string, fields?: LogFields): void {
    write('error', event, fields);
  },
};
