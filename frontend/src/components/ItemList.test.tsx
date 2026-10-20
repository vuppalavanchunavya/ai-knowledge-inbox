import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { KnowledgeItem } from '../types';
import { ItemList } from './ItemList';

const note: KnowledgeItem = {
  id: 'item-1',
  title: 'React Hooks',
  sourceType: 'note',
  originalUrl: null,
  createdAt: '2026-10-19T06:30:00.000Z',
  updatedAt: '2026-10-19T06:30:00.000Z',
  status: 'completed',
  errorMessage: null,
  preview: 'React Hooks allow functional components to use state.',
};

const failedUrl: KnowledgeItem = {
  id: 'item-2',
  title: 'example.com',
  sourceType: 'url',
  originalUrl: 'https://example.com/missing',
  createdAt: '2026-10-19T06:40:00.000Z',
  updatedAt: '2026-10-19T06:40:00.000Z',
  status: 'failed',
  errorMessage: 'The page returned HTTP 404.',
  preview: '',
};

describe('ItemList', () => {
  it('shows a loading state', () => {
    render(
      <ItemList
        items={[]}
        loading
        error={null}
        pagination={{ limit: 8, offset: 0, total: 0 }}
        onRetry={vi.fn()}
        onPage={vi.fn()}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Loading saved items…');
  });

  it('shows an empty state with a call to action', () => {
    render(
      <ItemList
        items={[]}
        loading={false}
        error={null}
        pagination={{ limit: 8, offset: 0, total: 0 }}
        onRetry={vi.fn()}
        onPage={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: 'No saved items yet' })).toBeInTheDocument();
    expect(screen.getByText(/Add a note or a public web page/)).toBeInTheDocument();
  });

  it('shows an error with a retry action', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <ItemList
        items={[]}
        loading={false}
        error="Saved items could not be loaded."
        pagination={{ limit: 8, offset: 0, total: 0 }}
        onRetry={onRetry}
        onPage={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('renders saved items and pages through the list', async () => {
    const user = userEvent.setup();
    const onPage = vi.fn();
    render(
      <ItemList
        items={[note, failedUrl]}
        loading={false}
        error={null}
        pagination={{ limit: 2, offset: 0, total: 4 }}
        onRetry={vi.fn()}
        onPage={onPage}
      />,
    );

    expect(screen.getByRole('heading', { name: 'React Hooks' })).toBeInTheDocument();
    expect(screen.getByText('Note')).toBeInTheDocument();
    expect(screen.getByText(note.preview)).toBeInTheDocument();
    expect(screen.getByText('Indexed')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: failedUrl.originalUrl! })).toHaveAttribute('href', failedUrl.originalUrl);
    expect(screen.getByText('The page returned HTTP 404.')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPage).toHaveBeenCalledWith(2);
  });
});
