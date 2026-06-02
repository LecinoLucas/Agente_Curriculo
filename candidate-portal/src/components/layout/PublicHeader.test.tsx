// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PublicHeader } from './PublicHeader';

describe('PublicHeader', () => {
  it('opens the mobile menu without duplicating the candidate area CTA', () => {
    render(
      <MemoryRouter>
        <PublicHeader />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByLabelText('Menu'));

    const header = screen.getByRole('banner');
    expect(within(header).getAllByText('Área do candidato')).toHaveLength(1);
    expect(screen.getAllByText('Sobre nós').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Nossas unidades').length).toBeGreaterThan(0);
  });
});
