// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PublicHomePage } from '../PublicHomePage';
import { PublicJobsPage } from '../PublicJobsPage';
import type { PublicJob } from '../../types/candidatePortal';

vi.mock('../../components/layout/CandidatePortalLayout', () => ({
  CandidatePortalLayout: ({ children }: { children: React.ReactNode }) => children,
}));

let mockCandidateName: string | null = null;
vi.mock('../../App', () => ({
  useCandidateSession: () => ({ candidateName: mockCandidateName, setCandidateName: () => {} }),
}));

const mockJobs: PublicJob[] = [
  {
    id: 'job-1',
    slug: 'job-1',
    title: 'Analista de Dados',
    company: 'Rede Marajó',
    location: 'Goiânia-GO',
    area: 'tecnologia',
    work_model: 'presencial',
    seniority: 'pleno',
    short_description: '',
    about_role: '',
    responsibilities: [],
    requirements: [],
    benefits: [],
    published_at: '',
  },
  {
    id: 'job-2',
    slug: 'job-2',
    title: 'Operador de Loja',
    company: 'Rede Marajó',
    location: 'Belém-PA',
    area: 'operacional',
    work_model: 'presencial',
    seniority: 'junior',
    short_description: '',
    about_role: '',
    responsibilities: [],
    requirements: [],
    benefits: [],
    published_at: '',
  },
];

const listJobsMock = vi.fn();
vi.mock('../../services/publicJobsService', () => ({
  publicJobsService: {
    listJobs: () => listJobsMock(),
  },
}));

beforeEach(() => {
  mockCandidateName = null;
  listJobsMock.mockResolvedValue(mockJobs);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PublicHomePage gateway', () => {
  it('renderiza gateway na home pública', () => {
    render(
      <MemoryRouter>
        <PublicHomePage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /Escolha como deseja começar/i })).not.toBeNull();
    expect(screen.getByRole('heading', { name: /Encontrar vaga com assistente/i })).not.toBeNull();
    expect(screen.getByRole('heading', { name: /Área do candidato/i })).not.toBeNull();
  });

  it('aponta CTAs do gateway para rotas reais', () => {
    render(
      <MemoryRouter>
        <PublicHomePage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /Encontrar vaga com assistente/i }).getAttribute('href')).toBe('/portal-2');
    expect(screen.getByRole('link', { name: /Área do candidato/i }).getAttribute('href')).toBe('/login');
  });

  it('aponta Área do candidato para /minha-area quando autenticado', () => {
    mockCandidateName = 'João Silva';
    render(
      <MemoryRouter>
        <PublicHomePage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /Área do candidato/i }).getAttribute('href')).toBe('/minha-area');
  });
});

describe('PublicJobsPage manual listing', () => {
  it('renderiza busca, filtros, contagem e vagas reais da API mockada', async () => {
    listJobsMock.mockResolvedValue(mockJobs);

    render(
      <MemoryRouter>
        <PublicJobsPage />
      </MemoryRouter>,
    );

    expect(screen.getByPlaceholderText(/Buscar por cargo ou localidade/i)).not.toBeNull();
    expect(screen.getByRole('button', { name: /Todas as áreas/i })).not.toBeNull();
    expect(screen.getByRole('button', { name: /Tecnologia/i })).not.toBeNull();

    await waitFor(() => {
      expect(screen.getByText(/2 vagas encontradas/i)).not.toBeNull();
    });

    expect(screen.getByText('Analista de Dados')).not.toBeNull();
    expect(screen.getByText('Operador de Loja')).not.toBeNull();
    expect(screen.getAllByRole('link', { name: /Ver vaga/i })[0].getAttribute('href')).toBe('/vagas/job-1');
  });

  it('não renderiza a tela gateway como conteúdo principal de /vagas', async () => {
    listJobsMock.mockResolvedValue(mockJobs);

    render(
      <MemoryRouter>
        <PublicJobsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/2 vagas encontradas/i)).not.toBeNull();
    });

    expect(screen.queryByRole('heading', { name: /Escolha como deseja começar/i })).toBeNull();
    expect(screen.queryByRole('heading', { name: /^Área do candidato$/i })).toBeNull();
  });

  it('não exibe acessos de desenvolvimento', async () => {
    listJobsMock.mockResolvedValue(mockJobs);

    render(
      <MemoryRouter>
        <PublicJobsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/2 vagas encontradas/i)).not.toBeNull();
    });

    expect(screen.queryByText('Acesso rápido de desenvolvimento')).toBeNull();
    expect(screen.queryByText('Entrar como candidato de teste')).toBeNull();
    expect(screen.queryByText('dev-candidato@local.test')).toBeNull();
  });
});
