import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import {
  CandidateHomeContent,
  CandidateHomeLoading,
  isSessionExpiredError,
} from './CandidateHomePage';
import { CandidateApplicationDetailContent } from './CandidateApplicationDetailPage';
import { HttpError } from '../services/publicApiClient';
import type {
  CandidateApplication,
  CandidateApplicationDetail,
  CandidateProfile,
} from '../services/candidatePortalService';

const profile: CandidateProfile = {
  id: 'candidate-id',
  fullName: 'Pessoa Candidata',
  email: 'pessoa@example.com',
  phone: '11999990000',
  city: 'São Paulo',
  state: 'SP',
  applicationSource: 'public_application',
  applicationSourceLabel: 'Candidatura pública',
  createdAt: '2026-05-01T12:00:00Z',
};

const applications: CandidateApplication[] = [
  {
    applicationId: 'application-one',
    jobId: 'job-one',
    jobTitle: 'Vaga Operacional',
    companyUnit: null,
    location: 'Belém, PA',
    submittedAt: '2026-05-10T12:00:00Z',
    currentStage: 'screening',
    currentStageLabel: 'Em triagem',
    status: 'screening',
    statusLabel: 'Em triagem',
    analysisStatus: 'completed',
    nextAction: null,
    updatedAt: '2026-05-11T12:00:00Z',
  },
  {
    applicationId: 'application-two',
    jobId: 'job-two',
    jobTitle: 'Vaga Administrativa',
    companyUnit: null,
    location: null,
    submittedAt: '2026-05-09T12:00:00Z',
    currentStage: 'hr_interview',
    currentStageLabel: 'Entrevista',
    status: 'interview',
    statusLabel: 'Entrevista',
    analysisStatus: null,
    nextAction: 'Comparecer à agenda retornada pela API',
    updatedAt: '2026-05-10T12:00:00Z',
  },
];

function renderWithRouter(element: React.ReactElement) {
  return renderToString(React.createElement(MemoryRouter, null, element));
}

function plainText(html: string) {
  return html.replace(/<!-- -->/g, '');
}

describe('/minha-area real data UI', () => {
  it('renders loading state', () => {
    const html = renderToString(React.createElement(CandidateHomeLoading));

    expect(html).toContain('bg-gray-100');
    expect(html).toContain('h-96');
  });

  it('renders honest empty state when API returns no applications', () => {
    const html = renderWithRouter(
      React.createElement(CandidateHomeContent, { profile, applications: [] }),
    );

    expect(html).toContain('Você ainda não possui candidaturas.');
    expect(html).toContain('Encontrar vaga com assistente');
    expect(html).not.toContain('Candidaturas reais');
  });

  it('renders applications returned by the API', () => {
    const html = renderWithRouter(
      React.createElement(CandidateHomeContent, { profile, applications }),
    );

    expect(html).toContain('Vaga Operacional');
    expect(html).toContain('Vaga Administrativa');
    expect(html).toContain('Comparecer à agenda retornada pela API');
  });

  it('renders the candidate greeting and authenticated sidebar menu', () => {
    const html = renderWithRouter(
      React.createElement(CandidateHomeContent, { profile, applications }),
    );

    expect(plainText(html)).toContain('Olá, Pessoa');
    expect(html).toContain('Início');
    expect(html).toContain('Minhas candidaturas');
    expect(html).toContain('Avaliações');
    expect(html).toContain('Documentos');
    expect(html).toContain('Mensagens');
    expect(html).toContain('Meu perfil');
  });

  it('renders pending assessment action when returned by the API', () => {
    const assessmentApplication: CandidateApplication = {
      ...applications[0],
      nextAction: 'Responder avaliação comportamental',
      currentStage: 'assessment',
      currentStageLabel: 'Avaliação',
    };

    const html = renderWithRouter(
      React.createElement(CandidateHomeContent, {
        profile,
        applications: [assessmentApplication],
      }),
    );

    expect(html).toContain('Responder avaliação comportamental');
    expect(plainText(html)).toContain('Etapa atual: Avaliação');
  });

  it('keeps Ver vagas links and Sair action available', () => {
    const html = renderWithRouter(
      React.createElement(CandidateHomeContent, { profile, applications }),
    );

    expect(html).toContain('href="/vagas"');
    expect(html).toContain('Ver vagas');
    expect(html).toContain('Sair');
  });

  it('does not render fixed product numbers unrelated to the API list', () => {
    const html = renderWithRouter(
      React.createElement(CandidateHomeContent, { profile, applications }),
    );

    expect(html).not.toContain(['80', '%'].join(''));
    expect(html).not.toContain(['4', ' candidaturas'].join(''));
  });

  it('does not render the old development quick access block', () => {
    const html = renderWithRouter(
      React.createElement(CandidateHomeContent, { profile, applications }),
    );

    expect(html).not.toContain('Acesso rápido de desenvolvimento');
  });

  it('detects expired session errors for login flow', () => {
    expect(isSessionExpiredError(new HttpError(401, 'Sessão expirada'))).toBe(true);
    expect(isSessionExpiredError(new HttpError(500, 'Erro'))).toBe(false);
  });
});

describe('/minha-area/candidaturas/:applicationId real data UI', () => {
  it('renders application detail from API payload', () => {
    const detail: CandidateApplicationDetail = {
      application: applications[0],
      job: {
        id: 'job-one',
        title: 'Vaga Operacional',
        description: 'Descrição retornada pela API.',
        requirements: 'Requisito retornado pela API.',
        responsibilities: null,
        location: 'Belém, PA',
        jobArea: 'Operações',
        workModel: null,
        seniorityLevel: null,
        benefits: [],
        workingHours: null,
      },
      timelineSteps: [
        { key: 'application_received', label: 'Inscrição recebida', status: 'completed' },
        { key: 'screening', label: 'Em triagem', status: 'current' },
      ],
      timelineEvents: [],
      interview: null,
      messages: [],
      documents: [],
    };

    const html = renderWithRouter(
      React.createElement(CandidateApplicationDetailContent, { detail }),
    );

    expect(html).toContain('Vaga Operacional');
    expect(html).toContain('Descrição retornada pela API.');
    expect(html).toContain('Em triagem');
    expect(html).not.toContain('Mensagens');
    expect(html).not.toContain('Documentos');
    expect(html).not.toContain('Entrevista</h2>');
  });
});
