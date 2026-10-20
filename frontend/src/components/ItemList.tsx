import type { KnowledgeItem, Pagination } from '../types';
import { ItemCard } from './ItemCard';
import { StatusBanner } from './StatusBanner';

interface ItemListProps {
  items: KnowledgeItem[];
  loading: boolean;
  error: string | null;
  pagination: Pagination;
  onRetry: () => void;
  onPage: (offset: number) => void;
}

export function ItemList({ items, loading, error, pagination, onRetry, onPage }: ItemListProps) {
  const showingFrom = pagination.total === 0 ? 0 : pagination.offset + 1;
  const showingTo = Math.min(pagination.offset + items.length, pagination.total);
  const hasPrevious = pagination.offset > 0;
  const hasNext = pagination.offset + pagination.limit < pagination.total;

  return (
    <section className="panel" aria-labelledby="saved-heading">
      <div className="panel-heading">
        <h2 id="saved-heading">Saved items</h2>
        {pagination.total > 0 ? (
          <p className="count">
            {showingFrom}–{showingTo} of {pagination.total}
          </p>
        ) : null}
      </div>

      {loading ? <p role="status">Loading saved items…</p> : null}
      {!loading && error ? (
        <div className="stack-tight">
          <StatusBanner tone="error">{error}</StatusBanner>
          <button className="button button-secondary" type="button" onClick={onRetry}>
            Retry
          </button>
        </div>
      ) : null}
      {!loading && !error && items.length === 0 ? (
        <div className="empty">
          <h3>No saved items yet</h3>
          <p>Add a note or a public web page. Indexed items will show up here and become available to questions.</p>
        </div>
      ) : null}
      {!loading && !error && items.length > 0 ? (
        <div className="item-list">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      ) : null}
      {!error && (hasPrevious || hasNext) ? (
        <div className="pager">
          <button className="button button-secondary" type="button" disabled={!hasPrevious} onClick={() => onPage(Math.max(0, pagination.offset - pagination.limit))}>
            Previous
          </button>
          <button className="button button-secondary" type="button" disabled={!hasNext} onClick={() => onPage(pagination.offset + pagination.limit)}>
            Next
          </button>
        </div>
      ) : null}
    </section>
  );
}
