// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PublicHeader } from './PublicHeader';

afterEach(cleanup);

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
    expect(screen.getAllByText('Home').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sobre nós').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Nossas unidades').length).toBeGreaterThan(0);
  });

  it('points logo, Home, Vagas and Área do candidato to the correct routes', () => {
    render(
      <MemoryRouter>
        <PublicHeader />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /Marajó RH/i }).getAttribute('href')).toBe('/');
    expect(screen.getByRole('link', { name: 'Home' }).getAttribute('href')).toBe('/');
    expect(screen.getByRole('link', { name: 'Vagas' }).getAttribute('href')).toBe('/vagas');
    expect(screen.getByRole('link', { name: /Área do candidato/i }).getAttribute('href')).toBe('/login');
  });

  it('points authenticated candidate identity to /minha-area', () => {
    render(
      <MemoryRouter>
        <PublicHeader candidateName="Pessoa Candidata" />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /Pessoa Candidata/i }).getAttribute('href')).toBe('/minha-area');
  });
});
