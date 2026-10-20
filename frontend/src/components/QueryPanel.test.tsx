import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AnswerResult } from '../types';
import { QueryPanel } from './QueryPanel';

const answer: AnswerResult = {
  answer: 'Your notes describe React Hooks as a way for functional components to use state.',
  sources: [
    {
      itemId: 'item-1',
      chunkId: 'chunk-1',
      title: 'React Hooks',
      sourceType: 'note',
      url: null,
      snippet: 'React Hooks allow functional components to use state.',
      score: 0.84,
    },
  ],
};

describe('QueryPanel', () => {
  it('requires a question', async () => {
    const user = userEvent.setup();
    const onAsk = vi.fn();
    render(<QueryPanel submitting={false} error={null} result={null} onAsk={onAsk} />);
    await user.click(screen.getByRole('button', { name: 'Ask Question' }));
    expect(screen.getByRole('alert')).toHaveTextContent('A question is required.');
    expect(onAsk).not.toHaveBeenCalled();
  });

  it('fills an example question and submits it', async () => {
    const user = userEvent.setup();
    const onAsk = vi.fn().mockResolvedValue(undefined);
    render(<QueryPanel submitting={false} error={null} result={null} onAsk={onAsk} />);
    await user.click(screen.getByRole('button', { name: 'What are the main ideas in my saved notes?' }));
    expect(screen.getByLabelText('Question')).toHaveValue('What are the main ideas in my saved notes?');
    await user.click(screen.getByRole('button', { name: 'Ask Question' }));
    expect(onAsk).toHaveBeenCalledWith('What are the main ideas in my saved notes?');
  });

  it('shows a loading state while the question is running', () => {
    render(<QueryPanel submitting error={null} result={null} onAsk={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Searching your knowledge base…');
    expect(screen.getByRole('button', { name: 'Asking…' })).toBeDisabled();
  });

  it('renders the answer, snippet, chunk id, and score', () => {
    render(<QueryPanel submitting={false} error={null} result={answer} onAsk={vi.fn()} />);
    expect(screen.getByText(answer.answer)).toBeInTheDocument();
    expect(screen.getByText('React Hooks allow functional components to use state.')).toBeInTheDocument();
    expect(screen.getByText('Chunk chunk-1')).toBeInTheDocument();
    expect(screen.getByText('Relevance 0.84')).toBeInTheDocument();
    expect(screen.getByText('Note')).toBeInTheDocument();
  });

  it('shows an insufficient-evidence answer without sources', () => {
    render(
      <QueryPanel
        submitting={false}
        error={null}
        result={{
          answer: 'The saved content does not provide enough information to answer that question.',
          sources: [],
        }}
        onAsk={vi.fn()}
      />,
    );
    expect(screen.getByText(/does not provide enough information/)).toBeInTheDocument();
    expect(screen.getByText(/No supporting passages/)).toBeInTheDocument();
  });

  it('shows a query error', () => {
    render(<QueryPanel submitting={false} error="The answer service could not complete this question." result={null} onAsk={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('answer service');
  });
});
