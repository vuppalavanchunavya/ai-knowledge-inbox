import type { AnswerResult } from '../types';

interface AnswerViewProps {
  result: AnswerResult;
}

export function AnswerView({ result }: AnswerViewProps) {
  return (
    <div className="answer-block">
      <h3>Answer</h3>
      <p className="answer-text">{result.answer}</p>
      <h3>Sources</h3>
      {result.sources.length === 0 ? (
        <p className="hint">No supporting passages were used for this answer.</p>
      ) : (
        <ol className="sources">
          {result.sources.map((source) => (
            <li key={source.chunkId} className="source-card">
              <div className="item-topline">
                <strong>{source.title}</strong>
                <span className="pill pill-completed">{source.sourceType === 'note' ? 'Note' : 'URL'}</span>
              </div>
              <p className="preview">{source.snippet}</p>
              <p className="source-meta">
                <span>Chunk {source.chunkId}</span>
                <span>Relevance {source.score.toFixed(2)}</span>
              </p>
              {source.url ? (
                <a className="item-link" href={source.url} target="_blank" rel="noreferrer">
                  Open original page
                </a>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
