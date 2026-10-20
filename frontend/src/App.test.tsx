import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { api, ApiError } from './api/client';

vi.mock('./api/client', () => {
  class MockApiError extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status: number) {
      super(message);
      this.name = 'ApiError';
      this.code = code;
      this.status = status;
    }
  }
  return {
    ApiError: MockApiError,
    api: {
      listItems: vi.fn(),
      ingestNote: vi.fn(),
      ingestUrl: vi.fn(),
      query: vi.fn(),
    },
  };
});

describe('App', () => {
  beforeEach(() => {
    vi.mocked(api.listItems).mockReset();
    vi.mocked(api.ingestNote).mockReset();
    vi.mocked(api.query).mockReset();
  });

  it('shows the empty knowledge base', async () => {
    vi.mocked(api.listItems).mockResolvedValue({
      items: [],
      pagination: { limit: 8, offset: 0, total: 0 },
    });
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'No saved items yet' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'AI Knowledge Inbox' })).toBeInTheDocument();
  });

  it('shows a load error and retries', async () => {
    const user = userEvent.setup();
    vi.mocked(api.listItems)
      .mockRejectedValueOnce(new ApiError('NETWORK_ERROR', 'Could not reach the server. Check that the backend is running.', 0))
      .mockResolvedValue({ items: [], pagination: { limit: 8, offset: 0, total: 0 } });
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'No saved items yet' })).toBeInTheDocument();
  });

  it('saves a note and asks a question through the workspace', async () => {
    const user = userEvent.setup();
    vi.mocked(api.listItems).mockResolvedValue({
      items: [],
      pagination: { limit: 8, offset: 0, total: 0 },
    });
    vi.mocked(api.ingestNote).mockResolvedValue({
      item: {
        id: 'item-1',
        title: 'React Hooks',
        sourceType: 'note',
        originalUrl: null,
        createdAt: '2026-10-19T06:30:00.000Z',
        updatedAt: '2026-10-19T06:30:00.000Z',
        status: 'completed',
        errorMessage: null,
        preview: 'Hooks store state.',
      },
    });
    vi.mocked(api.query).mockResolvedValue({
      answer: 'The saved content does not provide enough information to answer that question.',
      sources: [],
    });

    render(<App />);
    await screen.findByRole('heading', { name: 'No saved items yet' });
    await user.type(screen.getByLabelText('Title'), 'React Hooks');
    await user.type(screen.getByLabelText('Note'), 'Hooks store state.');
    await user.click(screen.getByRole('button', { name: 'Add Note' }));
    expect(await screen.findByText('Note saved and indexed.')).toBeInTheDocument();
    expect(api.ingestNote).toHaveBeenCalledWith({ title: 'React Hooks', content: 'Hooks store state.' });

    await user.type(screen.getByLabelText('Question'), 'What is missing?');
    await user.click(screen.getByRole('button', { name: 'Ask Question' }));
    expect(await screen.findByText(/does not provide enough information/)).toBeInTheDocument();
  });
});
