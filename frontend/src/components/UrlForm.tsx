import { type FormEvent, useState } from 'react';
import { StatusBanner } from './StatusBanner';

interface UrlFormProps {
  submitting: boolean;
  message: string | null;
  error: string | null;
  onSubmit: (input: { url: string }) => Promise<boolean>;
}

export function validateUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return 'A URL is required.';
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return 'Enter a valid HTTP or HTTPS URL.';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return 'Only HTTP and HTTPS URLs can be saved.';
  }
  return null;
}

export function UrlForm({ submitting, message, error, onSubmit }: UrlFormProps) {
  const [url, setUrl] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) {
      return;
    }
    const validationError = validateUrl(url);
    if (validationError) {
      setLocalError(validationError);
      return;
    }
    setLocalError(null);
    const saved = await onSubmit({ url: url.trim() });
    if (saved) {
      setUrl('');
    }
  }

  const visibleError = localError ?? error;

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      <label>
        URL
        <input
          name="url"
          type="url"
          inputMode="url"
          value={url}
          maxLength={2048}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://example.com/article"
        />
      </label>
      <p className="hint">The server fetches the page. Local and private addresses are blocked.</p>
      {visibleError ? <StatusBanner tone="error">{visibleError}</StatusBanner> : null}
      {message && !visibleError ? <StatusBanner tone="success">{message}</StatusBanner> : null}
      {submitting ? <p className="progress" role="status">Fetching and indexing the page…</p> : null}
      <button className="button" type="submit" disabled={submitting}>
        {submitting ? 'Adding URL…' : 'Add URL'}
      </button>
    </form>
  );
}
