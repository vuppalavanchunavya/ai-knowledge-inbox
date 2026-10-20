import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NoteForm } from './NoteForm';

describe('NoteForm', () => {
  it('requires a title and content before submitting', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<NoteForm submitting={false} message={null} error={null} onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: 'Add Note' }));
    expect(screen.getByRole('alert')).toHaveTextContent('A title is required.');
    expect(onSubmit).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Title'), 'React Hooks');
    await user.click(screen.getByRole('button', { name: 'Add Note' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Note content is required.');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows progress and blocks a second submission while saving', () => {
    render(<NoteForm submitting message={null} error={null} onSubmit={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Saving note…');
    expect(screen.getByRole('button', { name: 'Adding note…' })).toBeDisabled();
  });

  it('submits trimmed text and clears the form after success', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(<NoteForm submitting={false} message={null} error={null} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Title'), '  React Hooks  ');
    await user.type(screen.getByLabelText('Note'), '  Hooks store state.  ');
    await user.click(screen.getByRole('button', { name: 'Add Note' }));
    expect(onSubmit).toHaveBeenCalledWith({ title: 'React Hooks', content: 'Hooks store state.' });
    expect(screen.getByLabelText('Title')).toHaveValue('');
    expect(screen.getByLabelText('Note')).toHaveValue('');
  });

  it('shows an API error', () => {
    render(<NoteForm submitting={false} message={null} error="The embedding service could not index this content." onSubmit={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('embedding service');
  });
});
