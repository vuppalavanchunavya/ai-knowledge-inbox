import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { KnowledgeItem, Pagination } from '../types';

const PAGE_SIZE = 8;

export function useItems() {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ limit: PAGE_SIZE, offset: 0, total: 0 });
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listItems({ limit: PAGE_SIZE, offset });
      setItems(data.items);
      setPagination(data.pagination);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Saved items could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [offset]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { items, pagination, loading, error, reload, setOffset };
}
