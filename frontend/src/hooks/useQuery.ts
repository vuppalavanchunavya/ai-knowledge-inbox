import { useState } from 'react';
import { api, ApiError } from '../api/client';
import type { AnswerResult } from '../types';

export function useQuery() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);

  async function ask(question: string): Promise<void> {
    if (submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const data = await api.query({ question });
      setResult(data);
    } catch (caught) {
      setResult(null);
      setError(caught instanceof ApiError ? caught.message : 'The question could not be answered.');
    } finally {
      setSubmitting(false);
    }
  }

  return { submitting, error, result, ask };
}
