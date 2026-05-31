import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { PublicJobsPage } from '../pages/PublicJobsPage';
import { PublicJobPage } from '../pages/PublicJobPage';
import { ApplicationFormPage } from '../pages/ApplicationFormPage';
import { ApplicationSuccessPage } from '../pages/ApplicationSuccessPage';
import { CandidateLoginPage } from '../pages/CandidateLoginPage';
import { CandidateHomePage } from '../pages/CandidateHomePage';
import { CandidateAssessmentPage } from '../pages/CandidateAssessmentPage';
import { CandidatePreAdmissionPage } from '../pages/CandidatePreAdmissionPage';

export function CandidatePortalRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public redirect */}
        <Route path="/" element={<Navigate to="/vagas" replace />} />

        {/* Public job pages */}
        <Route path="/vagas" element={<PublicJobsPage />} />
        <Route path="/vagas/:identifier" element={<PublicJobPage />} />

        {/* Application flow */}
        <Route path="/candidatar/:slug" element={<ApplicationFormPage />} />
        <Route path="/sucesso" element={<ApplicationSuccessPage />} />

        {/* Auth */}
        <Route path="/login" element={<CandidateLoginPage />} />

        {/* Candidate area */}
        <Route path="/minha-area" element={<CandidateHomePage />} />
        <Route path="/avaliacao" element={<CandidateAssessmentPage />} />
        <Route path="/pre-admissao" element={<CandidatePreAdmissionPage />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/vagas" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
