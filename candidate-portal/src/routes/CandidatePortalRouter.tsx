import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { PublicJobsPage } from '../pages/PublicJobsPage';
import { PublicJobPage } from '../pages/PublicJobPage';
import { ApplicationFormPage } from '../pages/ApplicationFormPage';
import { ApplicationSuccessPage } from '../pages/ApplicationSuccessPage';
import { CandidateLoginPage } from '../pages/CandidateLoginPage';
import { PasswordSetupPage } from '../pages/PasswordSetupPage';
import { CandidateHomePage } from '../pages/CandidateHomePage';
import { CandidateAssessmentPage } from '../pages/CandidateAssessmentPage';
import { CandidatePreAdmissionPage } from '../pages/CandidatePreAdmissionPage';
import {
  ContactPage,
  FaqPage,
  PrivacyPage,
  TermsPage,
  UnitsPage,
  AboutPage,
} from '../pages/InstitutionalPages';

export function CandidatePortalRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public job pages */}
        <Route path="/" element={<PublicJobsPage />} />
        <Route path="/vagas" element={<Navigate to="/" replace />} />
        <Route path="/vagas/:identifier" element={<PublicJobPage />} />

        {/* Institutional pages */}
        <Route path="/sobre-nos" element={<AboutPage />} />
        <Route path="/unidades" element={<UnitsPage />} />
        <Route path="/duvidas-frequentes" element={<FaqPage />} />
        <Route path="/contato" element={<ContactPage />} />
        <Route path="/privacidade" element={<PrivacyPage />} />
        <Route path="/termos" element={<TermsPage />} />

        {/* Application flow */}
        <Route path="/candidatar/:identifier" element={<ApplicationFormPage />} />
        <Route path="/sucesso" element={<ApplicationSuccessPage />} />

        {/* Auth */}
        <Route path="/login" element={<CandidateLoginPage />} />
        <Route path="/definir-senha" element={<PasswordSetupPage />} />

        {/* Candidate area */}
        <Route path="/minha-area" element={<CandidateHomePage />} />
        <Route path="/avaliacao" element={<CandidateAssessmentPage />} />
        <Route path="/pre-admissao" element={<CandidatePreAdmissionPage />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
