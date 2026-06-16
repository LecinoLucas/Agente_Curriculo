// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const { MockHttpError } = vi.hoisted(() => {
  class MockHttpError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = 'HttpError';
      this.status = status;
    }
  }
  return { MockHttpError };
});

vi.mock('../../components/layout/CandidatePortalLayout', () => ({
  CandidatePortalLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="layout">{children}</div>
  ),
}));

vi.mock('../../components/ui/Card', () => ({
  Card: ({ children, padding }: { children: React.ReactNode; padding?: string }) => (
    <div data-testid="card" data-padding={padding}>{children}</div>
  ),
}));

vi.mock('../../components/ui/Button', () => ({
  Button: ({
    children,
    onClick,
    variant,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    variant?: string;
  }) => (
    <button data-variant={variant} onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock('../../hooks/useSessionRestore', () => ({
  useSessionRestore: vi.fn(),
}));

vi.mock('../../services/publicApiClient', () => ({
  HttpError: MockHttpError,
  publicApiClient: { get: vi.fn(), postForm: vi.fn(), baseUrl: '' },
}));

vi.mock('../../services/candidatePreAdmissionService', () => ({
  candidatePreAdmissionService: {
    getPreAdmission: vi.fn(),
    uploadDocument: vi.fn(),
    downloadUrl: vi.fn((id: string) => `/download/${id}`),
  },
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import { candidatePreAdmissionService } from '../../services/candidatePreAdmissionService';
import type { ChecklistItem } from '../../services/candidatePreAdmissionService';
import { CandidatePreAdmissionPage } from '../CandidatePreAdmissionPage';

const mockNavigate = vi.fn();

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SUMMARY_BASE = {
  hasCase: true,
  statusLabel: 'Em andamento',
  documentsTotal: 3,
  documentsPending: 1,
  documentsSubmitted: 1,
  documentsApproved: 1,
  nextPendingDocument: 'RG',
};

const ITEM_PENDING: ChecklistItem = {
  id: 'item-pending',
  title: 'RG',
  description: 'Identidade com foto',
  required: true,
  status: 'pending',
  statusLabel: 'Pendente',
  rejectionReasonPublic: null,
  uploadedDocument: null,
  allowedFileTypes: ['.pdf', '.jpg'],
  maxFileSizeMb: 5,
};

const ITEM_RECEIVED: ChecklistItem = {
  id: 'item-received',
  title: 'CPF',
  description: null,
  required: true,
  status: 'received',
  statusLabel: 'Em análise',
  rejectionReasonPublic: null,
  uploadedDocument: {
    id: 'doc-1',
    filename: 'cpf.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 204800,
    status: 'uploaded',
    statusLabel: 'Enviado',
    uploadedAt: '2026-01-10T10:00:00Z',
  },
  allowedFileTypes: ['.pdf'],
  maxFileSizeMb: 5,
};

const ITEM_APPROVED: ChecklistItem = {
  id: 'item-approved',
  title: 'Comprovante de residência',
  description: null,
  required: false,
  status: 'approved',
  statusLabel: 'Aprovado',
  rejectionReasonPublic: null,
  uploadedDocument: {
    id: 'doc-2',
    filename: 'residencia.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 102400,
    status: 'approved',
    statusLabel: 'Aprovado',
    uploadedAt: '2026-01-09T08:00:00Z',
  },
  allowedFileTypes: ['.pdf'],
  maxFileSizeMb: 5,
};

const ITEM_REJECTED_WITH_REASON: ChecklistItem = {
  id: 'item-rejected',
  title: 'Título de eleitor',
  description: null,
  required: true,
  status: 'rejected',
  statusLabel: 'Correção',
  rejectionReasonPublic: 'O documento enviado está ilegível. Envie uma versão clara e legível.',
  uploadedDocument: {
    id: 'doc-3',
    filename: 'titulo.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 512000,
    status: 'rejected',
    statusLabel: 'Rejeitado',
    uploadedAt: '2026-01-08T09:00:00Z',
  },
  allowedFileTypes: ['.jpg', '.png', '.pdf'],
  maxFileSizeMb: 5,
};

const ITEM_REJECTED_NO_REASON: ChecklistItem = {
  ...ITEM_REJECTED_WITH_REASON,
  id: 'item-rejected-no-reason',
  title: 'Certidão de nascimento',
  rejectionReasonPublic: null,
};

const ITEM_WAIVED: ChecklistItem = {
  id: 'item-waived',
  title: 'CNH',
  description: 'Opcional para essa vaga',
  required: false,
  status: 'waived',
  statusLabel: 'Dispensado',
  rejectionReasonPublic: null,
  uploadedDocument: null,
  allowedFileTypes: [],
  maxFileSizeMb: 10,
};

function makeCase(overrides: Partial<{ items: ChecklistItem[]; summary: typeof SUMMARY_BASE }> = {}) {
  return {
    case: {
      id: 'case-1',
      status: 'in_progress',
      statusLabel: 'Em andamento',
      salaryOffer: null,
      startDate: null,
      workModel: null,
      checklistItems: overrides.items ?? [ITEM_PENDING, ITEM_RECEIVED, ITEM_APPROVED],
      summary: overrides.summary ?? SUMMARY_BASE,
    },
    summary: overrides.summary ?? SUMMARY_BASE,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <CandidatePreAdmissionPage />
    </MemoryRouter>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CandidatePreAdmissionPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  describe('estados de carregamento e erro', () => {
    it('exibe skeleton durante carregamento', () => {
      vi.mocked(candidatePreAdmissionService.getPreAdmission).mockReturnValue(
        new Promise(() => {}),
      );
      renderPage();
      // Skeleton cards are present as animate-pulse divs
      const animatedEls = document.querySelectorAll('.animate-pulse');
      expect(animatedEls.length).toBeGreaterThan(0);
    });

    it('exibe estado vazio quando não há caso', async () => {
      vi.mocked(candidatePreAdmissionService.getPreAdmission).mockResolvedValue({
        case: null,
        summary: { ...SUMMARY_BASE, hasCase: false },
      });
      renderPage();
      expect(await screen.findByText('Nenhuma pré-admissão ativa')).toBeInTheDocument();
      expect(
        screen.getByText(/Você não possui um processo de pré-admissão/i),
      ).toBeInTheDocument();
    });

    it('exibe estado de erro com botão de retry em falha de rede', async () => {
      vi.mocked(candidatePreAdmissionService.getPreAdmission).mockRejectedValue(
        new Error('Timeout de rede'),
      );
      renderPage();
      expect(await screen.findByText('Timeout de rede')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /tentar novamente/i })).toBeInTheDocument();
    });

    it('redireciona para /login em 401', async () => {
      vi.mocked(candidatePreAdmissionService.getPreAdmission).mockRejectedValue(
        new MockHttpError('Unauthorized', 401),
      );
      renderPage();
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/login');
      });
    });

    it('exibe mensagem específica para 403', async () => {
      vi.mocked(candidatePreAdmissionService.getPreAdmission).mockRejectedValue(
        new MockHttpError('Forbidden', 403),
      );
      renderPage();
      expect(await screen.findByText(/perfil está incompleto/i)).toBeInTheDocument();
    });

    it('retry chama getPreAdmission novamente', async () => {
      vi.mocked(candidatePreAdmissionService.getPreAdmission)
        .mockRejectedValueOnce(new Error('Falha'))
        .mockResolvedValueOnce(makeCase());
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Falha');
      await user.click(screen.getByRole('button', { name: /tentar novamente/i }));
      expect(await screen.findByText('Pré-admissão')).toBeInTheDocument();
      expect(candidatePreAdmissionService.getPreAdmission).toHaveBeenCalledTimes(2);
    });
  });

  describe('progresso e resumo', () => {
    it('exibe contagem de documentos aprovados sobre o total na barra de progresso', async () => {
      vi.mocked(candidatePreAdmissionService.getPreAdmission).mockResolvedValue(makeCase());
      renderPage();
      expect(await screen.findByText(/1 de 3 documentos aprovados/i)).toBeInTheDocument();
    });

    it('exibe stats inline: pendentes, em análise, aprovados', async () => {
      vi.mocked(candidatePreAdmissionService.getPreAdmission).mockResolvedValue(makeCase());
      renderPage();
      await screen.findByText(/1 de 3 documentos aprovados/i);
      expect(screen.getByText(/1 pendente/i)).toBeInTheDocument();
      expect(screen.getByText(/1 em análise/i)).toBeInTheDocument();
      expect(screen.getByText(/1 aprovado/i)).toBeInTheDocument();
    });

    it('exibe "Correção solicitada" nas stats quando há itens rejeitados', async () => {
      const summary = { ...SUMMARY_BASE, documentsPending: 0, documentsSubmitted: 0, documentsApproved: 2, documentsTotal: 3 };
      vi.mocked(candidatePreAdmissionService.getPreAdmission).mockResolvedValue(
        makeCase({ items: [ITEM_APPROVED, ITEM_REJECTED_WITH_REASON, ITEM_WAIVED], summary }),
      );
      renderPage();
      await screen.findAllByText(/documentos aprovados/i);
      const correctionStats = screen.getAllByText(/correção solicitada/i);
      expect(correctionStats.length).toBeGreaterThan(0);
    });

    it('exibe "Correção solicitada" no resumo lateral quando há itens rejeitados', async () => {
      const summary = { ...SUMMARY_BASE, documentsPending: 0, documentsSubmitted: 0, documentsApproved: 2, documentsTotal: 3 };
      vi.mocked(candidatePreAdmissionService.getPreAdmission).mockResolvedValue(
        makeCase({ items: [ITEM_APPROVED, ITEM_REJECTED_WITH_REASON, ITEM_WAIVED], summary }),
      );
      renderPage();
      await screen.findAllByText(/documentos aprovados/i);
      // Sidebar stats section should show correction count
      expect(screen.getByText('Resumo')).toBeInTheDocument();
      const correctionLabels = screen.getAllByText(/correção solicitada/i);
      expect(correctionLabels.length).toBeGreaterThanOrEqual(2); // inline stats + sidebar
    });

    it('exibe dica de próxima ação quando há nextPendingDocument', async () => {
      vi.mocked(candidatePreAdmissionService.getPreAdmission).mockResolvedValue(makeCase());
      renderPage();
      // "Próxima ação:" label appears in the hint block
      expect(await screen.findByText(/Próxima ação/i)).toBeInTheDocument();
      // The document name appears somewhere in the hint block's parent paragraph
      const hint = screen.getByText(/Próxima ação/i);
      expect(hint.closest('p')?.textContent ?? hint.textContent).toMatch(/RG/);
    });

    it('não exibe dica de próxima ação quando documentsPending é 0', async () => {
      const summary = { ...SUMMARY_BASE, documentsPending: 0, nextPendingDocument: 'CPF' };
      vi.mocked(candidatePreAdmissionService.getPreAdmission).mockResolvedValue(
        makeCase({ items: [ITEM_RECEIVED, ITEM_APPROVED], summary }),
      );
      renderPage();
      await screen.findAllByText(/documentos aprovados/i);
      expect(screen.queryByText(/Próxima ação/i)).not.toBeInTheDocument();
    });

    it('exibe banner de "todos enviados" quando todos obrigatórios estão em análise ou aprovados', async () => {
      const summary = { ...SUMMARY_BASE, documentsPending: 0, documentsSubmitted: 2, documentsApproved: 1 };
      vi.mocked(candidatePreAdmissionService.getPreAdmission).mockResolvedValue(
        makeCase({ items: [ITEM_RECEIVED, { ...ITEM_RECEIVED, id: 'item-received-2' }, ITEM_APPROVED], summary }),
      );
      renderPage();
      expect(
        await screen.findByText(/Todos os documentos obrigatórios foram enviados/i),
      ).toBeInTheDocument();
    });
  });

  describe('status dos documentos — labels humanizados', () => {
    it('exibe "Pendente de envio" para status pending', async () => {
      vi.mocked(candidatePreAdmissionService.getPreAdmission).mockResolvedValue(
        makeCase({ items: [ITEM_PENDING], summary: { ...SUMMARY_BASE, documentsTotal: 1, documentsPending: 1, documentsSubmitted: 0, documentsApproved: 0 } }),
      );
      renderPage();
      expect(await screen.findByText('Pendente de envio')).toBeInTheDocument();
    });

    it('exibe "Em análise pelo RH" para status received', async () => {
      vi.mocked(candidatePreAdmissionService.getPreAdmission).mockResolvedValue(
        makeCase({ items: [ITEM_RECEIVED], summary: { ...SUMMARY_BASE, documentsTotal: 1, documentsPending: 0, documentsSubmitted: 1, documentsApproved: 0 } }),
      );
      renderPage();
      expect(await screen.findByText('Em análise pelo RH')).toBeInTheDocument();
    });

    it('exibe "Aprovado" para status approved', async () => {
      vi.mocked(candidatePreAdmissionService.getPreAdmission).mockResolvedValue(
        makeCase({ items: [ITEM_APPROVED], summary: { ...SUMMARY_BASE, documentsTotal: 1, documentsPending: 0, documentsSubmitted: 0, documentsApproved: 1 } }),
      );
      renderPage();
      expect(await screen.findByText('Aprovado')).toBeInTheDocument();
    });

    it('exibe "Correção solicitada" para status rejected', async () => {
      vi.mocked(candidatePreAdmissionService.getPreAdmission).mockResolvedValue(
        makeCase({ items: [ITEM_REJECTED_WITH_REASON], summary: { ...SUMMARY_BASE, documentsTotal: 1, documentsPending: 0, documentsSubmitted: 0, documentsApproved: 0 } }),
      );
      renderPage();
      const badges = await screen.findAllByText('Correção solicitada');
      expect(badges.length).toBeGreaterThan(0);
    });

    it('exibe "Dispensado" para status waived', async () => {
      vi.mocked(candidatePreAdmissionService.getPreAdmission).mockResolvedValue(
        makeCase({ items: [ITEM_WAIVED], summary: { ...SUMMARY_BASE, documentsTotal: 1, documentsPending: 0, documentsSubmitted: 0, documentsApproved: 0 } }),
      );
      renderPage();
      expect(await screen.findByText('Dispensado')).toBeInTheDocument();
    });
  });

  describe('exibição de rejeição/correção', () => {
    it('exibe rejectionReasonPublic quando preenchido', async () => {
      vi.mocked(candidatePreAdmissionService.getPreAdmission).mockResolvedValue(
        makeCase({ items: [ITEM_REJECTED_WITH_REASON], summary: { ...SUMMARY_BASE, documentsTotal: 1, documentsPending: 0, documentsSubmitted: 0, documentsApproved: 0 } }),
      );
      renderPage();
      expect(
        await screen.findByText('O documento enviado está ilegível. Envie uma versão clara e legível.'),
      ).toBeInTheDocument();
    });

    it('exibe mensagem genérica quando rejectionReasonPublic é null', async () => {
      vi.mocked(candidatePreAdmissionService.getPreAdmission).mockResolvedValue(
        makeCase({ items: [ITEM_REJECTED_NO_REASON], summary: { ...SUMMARY_BASE, documentsTotal: 1, documentsPending: 0, documentsSubmitted: 0, documentsApproved: 0 } }),
      );
      renderPage();
      expect(
        await screen.findByText(/O RH solicitou correção deste documento/i),
      ).toBeInTheDocument();
    });

    it('NÃO exibe review_notes para o candidato', async () => {
      // review_notes is an internal HR field and must never appear in the candidate portal.
      // The candidatePreAdmissionService type does not expose it; we verify that
      // even if it somehow appeared in a fixture, it is never rendered.
      vi.mocked(candidatePreAdmissionService.getPreAdmission).mockResolvedValue(
        makeCase({ items: [ITEM_REJECTED_WITH_REASON], summary: { ...SUMMARY_BASE, documentsTotal: 1, documentsPending: 0, documentsSubmitted: 0, documentsApproved: 0 } }),
      );
      renderPage();
      await screen.findByText('Título de eleitor');
      // review_notes text that would only appear if the type exposed it
      expect(screen.queryByText(/nota interna/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/review_notes/i)).not.toBeInTheDocument();
    });

    it('exibe "Envie uma nova versão abaixo" no bloco de rejeição', async () => {
      vi.mocked(candidatePreAdmissionService.getPreAdmission).mockResolvedValue(
        makeCase({ items: [ITEM_REJECTED_WITH_REASON], summary: { ...SUMMARY_BASE, documentsTotal: 1, documentsPending: 0, documentsSubmitted: 0, documentsApproved: 0 } }),
      );
      renderPage();
      expect(await screen.findByText(/Envie uma nova versão abaixo/i)).toBeInTheDocument();
    });
  });

  describe('upload — zona e dicas', () => {
    it('exibe zona de upload para documento pendente', async () => {
      vi.mocked(candidatePreAdmissionService.getPreAdmission).mockResolvedValue(
        makeCase({ items: [ITEM_PENDING], summary: { ...SUMMARY_BASE, documentsTotal: 1, documentsPending: 1, documentsSubmitted: 0, documentsApproved: 0 } }),
      );
      renderPage();
      expect(
        await screen.findByText(/Clique para enviar ou arraste o arquivo/i),
      ).toBeInTheDocument();
    });

    it('exibe dica de formatos e tamanho máximo', async () => {
      vi.mocked(candidatePreAdmissionService.getPreAdmission).mockResolvedValue(
        makeCase({ items: [ITEM_PENDING], summary: { ...SUMMARY_BASE, documentsTotal: 1, documentsPending: 1, documentsSubmitted: 0, documentsApproved: 0 } }),
      );
      renderPage();
      await screen.findByText(/Clique para enviar ou arraste o arquivo/i);
      expect(screen.getByText(/PDF, JPG/i)).toBeInTheDocument();
      expect(screen.getByText(/Máx. 5 MB/i)).toBeInTheDocument();
    });

    it('não exibe zona de upload para documento em análise', async () => {
      vi.mocked(candidatePreAdmissionService.getPreAdmission).mockResolvedValue(
        makeCase({ items: [ITEM_RECEIVED], summary: { ...SUMMARY_BASE, documentsTotal: 1, documentsPending: 0, documentsSubmitted: 1, documentsApproved: 0 } }),
      );
      renderPage();
      await screen.findByText('CPF');
      expect(screen.queryByText(/Clique para enviar/i)).not.toBeInTheDocument();
    });

    it('não exibe zona de upload para documento aprovado', async () => {
      vi.mocked(candidatePreAdmissionService.getPreAdmission).mockResolvedValue(
        makeCase({ items: [ITEM_APPROVED], summary: { ...SUMMARY_BASE, documentsTotal: 1, documentsPending: 0, documentsSubmitted: 0, documentsApproved: 1 } }),
      );
      renderPage();
      await screen.findByText('Comprovante de residência');
      expect(screen.queryByText(/Clique para enviar/i)).not.toBeInTheDocument();
    });

    it('exibe zona de upload para documento rejeitado', async () => {
      vi.mocked(candidatePreAdmissionService.getPreAdmission).mockResolvedValue(
        makeCase({ items: [ITEM_REJECTED_WITH_REASON], summary: { ...SUMMARY_BASE, documentsTotal: 1, documentsPending: 0, documentsSubmitted: 0, documentsApproved: 0 } }),
      );
      renderPage();
      expect(await screen.findByText(/Clique para enviar ou arraste o arquivo/i)).toBeInTheDocument();
    });

    it('exibe erro de arquivo muito grande sem chamar API', async () => {
      vi.mocked(candidatePreAdmissionService.getPreAdmission).mockResolvedValue(
        makeCase({ items: [ITEM_PENDING], summary: { ...SUMMARY_BASE, documentsTotal: 1, documentsPending: 1, documentsSubmitted: 0, documentsApproved: 0 } }),
      );
      const user = userEvent.setup();
      renderPage();
      await screen.findByText(/Clique para enviar/i);
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      // 6 MB > 5 MB limit
      const bigFile = new File([''], 'big.pdf', { type: 'application/pdf' });
      Object.defineProperty(bigFile, 'size', { value: 6 * 1024 * 1024 });
      await user.upload(fileInput, bigFile);
      expect(await screen.findByText(/Arquivo muito grande/i)).toBeInTheDocument();
      expect(candidatePreAdmissionService.uploadDocument).not.toHaveBeenCalled();
    });

    it('exibe estado de upload em progresso', async () => {
      vi.mocked(candidatePreAdmissionService.getPreAdmission).mockResolvedValue(
        makeCase({ items: [ITEM_PENDING], summary: { ...SUMMARY_BASE, documentsTotal: 1, documentsPending: 1, documentsSubmitted: 0, documentsApproved: 0 } }),
      );
      vi.mocked(candidatePreAdmissionService.uploadDocument).mockReturnValue(
        new Promise(() => {}),
      );
      const user = userEvent.setup();
      renderPage();
      const fileInput = (await screen.findByText(/Clique para enviar/i)).closest('label')!
        .querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['content'], 'rg.pdf', { type: 'application/pdf' });
      await user.upload(fileInput, file);
      expect(await screen.findByText('Enviando…')).toBeInTheDocument();
    });

    it('exibe mensagem de erro quando upload falha', async () => {
      vi.mocked(candidatePreAdmissionService.getPreAdmission).mockResolvedValue(
        makeCase({ items: [ITEM_PENDING], summary: { ...SUMMARY_BASE, documentsTotal: 1, documentsPending: 1, documentsSubmitted: 0, documentsApproved: 0 } }),
      );
      vi.mocked(candidatePreAdmissionService.uploadDocument).mockRejectedValue(
        new Error('Servidor indisponível'),
      );
      const user = userEvent.setup();
      renderPage();
      const fileInput = (await screen.findByText(/Clique para enviar/i)).closest('label')!
        .querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['content'], 'rg.pdf', { type: 'application/pdf' });
      await user.upload(fileInput, file);
      expect(await screen.findByText('Servidor indisponível')).toBeInTheDocument();
    });

    it('recarrega caso após upload bem-sucedido', async () => {
      vi.mocked(candidatePreAdmissionService.getPreAdmission)
        .mockResolvedValueOnce(
          makeCase({ items: [ITEM_PENDING], summary: { ...SUMMARY_BASE, documentsTotal: 1, documentsPending: 1, documentsSubmitted: 0, documentsApproved: 0 } }),
        )
        .mockResolvedValueOnce(
          makeCase({ items: [ITEM_RECEIVED], summary: { ...SUMMARY_BASE, documentsTotal: 1, documentsPending: 0, documentsSubmitted: 1, documentsApproved: 0 } }),
        );
      vi.mocked(candidatePreAdmissionService.uploadDocument).mockResolvedValue({
        id: 'doc-new',
        filename: 'rg.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 100000,
        status: 'uploaded',
        statusLabel: 'Enviado',
        uploadedAt: new Date().toISOString(),
      });
      const user = userEvent.setup();
      renderPage();
      const fileInput = (await screen.findByText(/Clique para enviar/i)).closest('label')!
        .querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['content'], 'rg.pdf', { type: 'application/pdf' });
      await user.upload(fileInput, file);
      // After reload, the item should show "Em análise pelo RH"
      expect(await screen.findByText('Em análise pelo RH')).toBeInTheDocument();
      expect(candidatePreAdmissionService.getPreAdmission).toHaveBeenCalledTimes(2);
    });
  });

  describe('informações do caso', () => {
    it('exibe salário ofertado quando disponível', async () => {
      vi.mocked(candidatePreAdmissionService.getPreAdmission).mockResolvedValue({
        ...makeCase(),
        case: { ...makeCase().case!, salaryOffer: '3500.00' },
      });
      renderPage();
      expect(await screen.findByText('Salário ofertado')).toBeInTheDocument();
      expect(screen.getByText(/R\$\s*3\.500/)).toBeInTheDocument();
    });

    it('não exibe salário quando não disponível', async () => {
      vi.mocked(candidatePreAdmissionService.getPreAdmission).mockResolvedValue(makeCase());
      renderPage();
      await screen.findByText('Pré-admissão');
      expect(screen.queryByText('Salário ofertado')).not.toBeInTheDocument();
    });

    it('exibe data de início previsto quando disponível', async () => {
      vi.mocked(candidatePreAdmissionService.getPreAdmission).mockResolvedValue({
        ...makeCase(),
        case: { ...makeCase().case!, startDate: '2026-02-01' },
      });
      renderPage();
      expect(await screen.findByText(/Início previsto/i)).toBeInTheDocument();
    });
  });
});
