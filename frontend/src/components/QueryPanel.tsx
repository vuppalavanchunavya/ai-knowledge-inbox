import { type FormEvent, useState } from 'react';
import type { AnswerResult } from '../types';
import { AnswerView } from './AnswerView';
import { StatusBanner } from './StatusBanner';

const EXAMPLES = [
  'What are the main ideas in my saved notes?',
  'What do React Hooks do according to my notes?',
  'What is example.com used for?',
];

interface QueryPanelProps {
  submitting: boolean;
  error: string | null;
  result: AnswerResult | null;
  onAsk: (question: string) => Promise<void> | void;
}

export function QueryPanel({ submitting, error, result, onAsk }: QueryPanelProps) {
  const [question, setQuestion] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) {
      return;
    }
    if (!question.trim()) {
      setLocalError('A question is required.');
      return;
    }
    setLocalError(null);
    await onAsk(question.trim());
  }

  const visibleError = localError ?? error;

  return (
    <section className="panel ask-panel" aria-labelledby="ask-heading">
      <div className="panel-heading">
        <h2 id="ask-heading">Ask a question</h2>
      </div>
      <p className="hint">Answers use only the passages retrieved from your saved items.</p>
      <div className="examples">
        {EXAMPLES.map((example) => (
          <button key={example} className="example" type="button" onClick={() => setQuestion(example)}>
            {example}
          </button>
        ))}
      </div>
      <form className="form" onSubmit={handleSubmit}>
        <label>
          Question
          <textarea
            name="question"
            value={question}
            rows={5}
            maxLength={2000}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="What do my notes say about React Hooks?"
          />
        </label>
        {visibleError ? <StatusBanner tone="error">{visibleError}</StatusBanner> : null}
        {submitting ? <p className="progress" role="status">Searching your knowledge base…</p> : null}
        <button className="button" type="submit" disabled={submitting}>
          {submitting ? 'Asking…' : 'Ask Question'}
        </button>
      </form>
      {result ? <AnswerView result={result} /> : null}
    </section>
  );
}
