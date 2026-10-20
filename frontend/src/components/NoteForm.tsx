import { type FormEvent, useState } from 'react';
import { StatusBanner } from './StatusBanner';

interface NoteFormProps {
  submitting: boolean;
  message: string | null;
  error: string | null;
  onSubmit: (input: { title: string; content: string }) => Promise<boolean>;
}

export function NoteForm({ submitting, message, error, onSubmit }: NoteFormProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) {
      return;
    }
    if (!title.trim()) {
      setLocalError('A title is required.');
      return;
    }
    if (!content.trim()) {
      setLocalError('Note content is required.');
      return;
    }
    setLocalError(null);
    const saved = await onSubmit({ title: title.trim(), content: content.trim() });
    if (saved) {
      setTitle('');
      setContent('');
    }
  }

  const visibleError = localError ?? error;

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      <label>
        Title
        <input
          name="title"
          value={title}
          maxLength={200}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="React Hooks"
        />
      </label>
      <label>
        Note
        <textarea
          name="content"
          value={content}
          rows={7}
          maxLength={100000}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Write the plain text you want to remember."
        />
      </label>
      {visibleError ? <StatusBanner tone="error">{visibleError}</StatusBanner> : null}
      {message && !visibleError ? <StatusBanner tone="success">{message}</StatusBanner> : null}
      {submitting ? <p className="progress" role="status">Saving note…</p> : null}
      <button className="button" type="submit" disabled={submitting}>
        {submitting ? 'Adding note…' : 'Add Note'}
      </button>
    </form>
  );
}
