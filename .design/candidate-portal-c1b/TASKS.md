# Build Tasks: Candidate Portal C1B

Date: 2026-05-31
Philosophy: MarajóRH Professional (Functionalist + Scandinavian warmth)

## Foundation
- [ ] **Config files**: package.json, vite.config.ts, tsconfig.json, tailwind.config.js, postcss.config.js, index.html
- [ ] **Types**: candidatePortal.ts — PublicJob, Application, CandidateProfile, AssessmentQuestion, DocumentItem
- [ ] **Design tokens**: styles/index.css — CSS variables + Google Fonts import + Tailwind extensions
- [ ] **Mock data**: data/mockCandidatePortal.ts — 3 vagas, 1 candidato, 5 questões, 5 documentos
- [ ] **Services**: mockCandidatePortalService.ts (async com delay) + publicApiClient.ts (placeholder)

## Core UI Components
- [ ] **Button**: variant (primary, secondary, outline, ghost), size (sm, md, lg), loading state
- [ ] **Card**: wrapper com sombra, padding e border radius
- [ ] **Input**: label, error, helper text, ícone opcional
- [ ] **Badge**: variant (area, status, work-model), size (sm, md)
- [ ] **Textarea**: mesma API do Input
- [ ] **Stepper**: step indicator horizontal e vertical

## Shared Components
- [ ] **ProcessStepper**: etapas do processo seletivo (Candidatura→Triagem→Avaliação→Entrevista→Admissão)
- [ ] **StatusCard**: card de mensagem com ícone e tipo (info, action, alert)
- [ ] **DocumentChecklist**: lista de documentos com status badges e upload mock
- [ ] **UploadMockCard**: área de upload simulada com feedback visual
- [ ] **LoadingState**: skeleton loader e spinner

## Layout
- [ ] **PublicHeader**: logo MarajóRH, nav links, CTA "Área do candidato"
- [ ] **PublicFooter**: rodapé simples com links e copyright
- [ ] **CandidatePortalLayout**: wrapper com header/footer, max-width, padding responsivo

## Pages
- [ ] **PublicJobsPage**: lista com filtros de área/modelo, cards de vagas
- [ ] **PublicJobPage**: detalhe da vaga, two-column layout, CTA candidatura
- [ ] **ApplicationFormPage**: 3 steps (dados → currículo → revisão), sidebar com resumo
- [ ] **ApplicationSuccessPage**: confirmação com próximos passos
- [ ] **CandidateLoginPage**: login mock email/senha
- [ ] **CandidateHomePage**: dashboard — stepper, próxima ação, candidaturas, perfil, mensagens
- [ ] **CandidateAssessmentPage**: questões Likert com progresso, sidebar de vaga
- [ ] **CandidatePreAdmissionPage**: checklist de documentos, progresso, próximos passos

## Router + App
- [ ] **CandidatePortalRouter**: React Router v6 com todas as 8 rotas + redirect / → /vagas
- [ ] **App.tsx**: provider de contexto mock auth + router
- [ ] **main.tsx**: entry point

## Validação
- [ ] npm install
- [ ] npm run build (zero erros)
- [ ] Design Review
