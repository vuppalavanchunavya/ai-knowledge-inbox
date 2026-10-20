import { useState } from 'react';
import { NoteForm } from './NoteForm';
import { UrlForm } from './UrlForm';

interface AddContentProps {
  submitting: boolean;
  message: string | null;
  error: string | null;
  onClearStatus: () => void;
  onSubmitNote: (input: { title: string; content: string }) => Promise<boolean>;
  onSubmitUrl: (input: { url: string }) => Promise<boolean>;
}

export function AddContent({
  submitting,
  message,
  error,
  onClearStatus,
  onSubmitNote,
  onSubmitUrl,
}: AddContentProps) {
  const [mode, setMode] = useState<'note' | 'url'>('note');

  function selectMode(next: 'note' | 'url') {
    setMode(next);
    onClearStatus();
  }

  return (
    <section className="panel" aria-labelledby="add-heading">
      <div className="panel-heading">
        <h2 id="add-heading">Add content</h2>
        <div className="tabs" role="tablist" aria-label="Content type">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'note'}
            className={mode === 'note' ? 'tab tab-active' : 'tab'}
            onClick={() => selectMode('note')}
          >
            Add Note
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'url'}
            className={mode === 'url' ? 'tab tab-active' : 'tab'}
            onClick={() => selectMode('url')}
          >
            Add URL
          </button>
        </div>
      </div>
      {mode === 'note' ? (
        <NoteForm submitting={submitting} message={message} error={error} onSubmit={onSubmitNote} />
      ) : (
        <UrlForm submitting={submitting} message={message} error={error} onSubmit={onSubmitUrl} />
      )}
    </section>
  );
}
