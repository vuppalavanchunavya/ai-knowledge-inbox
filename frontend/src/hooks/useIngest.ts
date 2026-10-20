import { useState } from 'react';
import { api, ApiError } from '../api/client';

export function useIngest(onSettled: () => void) {
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(work: () => Promise<void>, success: string): Promise<boolean> {
    if (submitting) {
      return false;
    }
    setSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      await work();
      setMessage(success);
      onSettled();
      return true;
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The content could not be saved.');
      onSettled();
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  return {
    submitting,
    message,
    error,
    clearStatus() {
      setMessage(null);
      setError(null);
    },
    submitNote(input: { title: string; content: string }) {
      return run(() => api.ingestNote(input).then(() => undefined), 'Note saved and indexed.');
    },
    submitUrl(input: { url: string }) {
      return run(() => api.ingestUrl(input).then(() => undefined), 'Page fetched and indexed.');
    },
  };
}
