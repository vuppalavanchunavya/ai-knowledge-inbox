import { AddContent } from './components/AddContent';
import { Header } from './components/Header';
import { ItemList } from './components/ItemList';
import { QueryPanel } from './components/QueryPanel';
import { useIngest } from './hooks/useIngest';
import { useItems } from './hooks/useItems';
import { useQuery } from './hooks/useQuery';

export function App() {
  const items = useItems();
  const ingest = useIngest(() => {
    void items.reload();
  });
  const query = useQuery();

  return (
    <div className="page">
      <Header onRefresh={() => void items.reload()} refreshing={items.loading} />
      <main className="workspace">
        <div className="column">
          <AddContent
            submitting={ingest.submitting}
            message={ingest.message}
            error={ingest.error}
            onClearStatus={ingest.clearStatus}
            onSubmitNote={ingest.submitNote}
            onSubmitUrl={ingest.submitUrl}
          />
          <ItemList
            items={items.items}
            loading={items.loading}
            error={items.error}
            pagination={items.pagination}
            onRetry={() => void items.reload()}
            onPage={items.setOffset}
          />
        </div>
        <div className="column ask-column">
          <QueryPanel
            submitting={query.submitting}
            error={query.error}
            result={query.result}
            onAsk={query.ask}
          />
        </div>
      </main>
    </div>
  );
}
