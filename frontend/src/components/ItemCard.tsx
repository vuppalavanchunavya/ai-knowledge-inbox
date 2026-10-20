import type { KnowledgeItem } from '../types';

interface ItemCardProps {
  item: KnowledgeItem;
}

const STATUS_LABEL: Record<KnowledgeItem['status'], string> = {
  pending: 'Pending',
  processing: 'Processing',
  completed: 'Indexed',
  failed: 'Failed',
};

export function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function ItemCard({ item }: ItemCardProps) {
  return (
    <article className="item-card">
      <div className="item-topline">
        <h3>{item.title}</h3>
        <span className={`pill pill-${item.status}`}>{STATUS_LABEL[item.status]}</span>
      </div>
      <p className="item-meta">
        <span>{item.sourceType === 'note' ? 'Note' : 'URL'}</span>
        <time dateTime={item.createdAt}>{formatTimestamp(item.createdAt)}</time>
      </p>
      {item.originalUrl ? (
        <a className="item-link" href={item.originalUrl} target="_blank" rel="noreferrer">
          {item.originalUrl}
        </a>
      ) : null}
      {item.status === 'failed' && item.errorMessage ? <p className="item-error">{item.errorMessage}</p> : null}
      {item.preview ? <p className="preview">{item.preview}</p> : null}
    </article>
  );
}
