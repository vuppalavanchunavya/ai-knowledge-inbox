interface HeaderProps {
  onRefresh: () => void;
  refreshing: boolean;
}

export function Header({ onRefresh, refreshing }: HeaderProps) {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">Personal knowledge base</p>
        <h1>AI Knowledge Inbox</h1>
        <p className="lede">
          Save notes and web pages, then ask questions that are answered only from what you saved.
        </p>
      </div>
      <button className="button button-secondary" type="button" onClick={onRefresh} disabled={refreshing}>
        {refreshing ? 'Refreshing…' : 'Refresh'}
      </button>
    </header>
  );
}
