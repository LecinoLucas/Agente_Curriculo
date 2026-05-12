export type GoogleFormSubmission = {
  id: string;
  candidateName: string;
  email: string;
  submittedAt: string;
  fileName: string;
  fileSize: string;
  status: "pending" | "processing" | "duplicate" | "completed" | "error";
  validationStatus: "valid" | "invalid" | "unverified";
  driveFileId: string;
  errorMessage?: string;
};

export const MOCK_SUBMISSIONS: GoogleFormSubmission[] = [
  {
    id: "resp_001",
    candidateName: "João Silva",
    email: "joao.silva@example.com",
    submittedAt: "2026-05-11T12:30:00Z",
    fileName: "cv_joao_silva.pdf",
    fileSize: "1.2 MB",
    status: "completed",
    validationStatus: "valid",
    driveFileId: "drive_file_id_101",
  },
  {
    id: "resp_002",
    candidateName: "Maria Santos",
    email: "maria.santos@example.com",
    submittedAt: "2026-05-11T12:45:00Z",
    fileName: "curriculo_maria.pdf",
    fileSize: "850 KB",
    status: "duplicate",
    validationStatus: "valid",
    driveFileId: "drive_file_id_102",
    errorMessage: "Candidato já cadastrado com este e-mail.",
  },
  {
    id: "resp_003",
    candidateName: "Carlos Oliveira",
    email: "carlos.o@example.com",
    submittedAt: "2026-05-11T13:00:00Z",
    fileName: "carlos_resume.pdf",
    fileSize: "2.1 MB",
    status: "processing",
    validationStatus: "valid",
    driveFileId: "drive_file_id_103",
  },
  {
    id: "resp_004",
    candidateName: "Ana Costa",
    email: "ana.costa@example.com",
    submittedAt: "2026-05-11T13:15:00Z",
    fileName: "my_cv.pdf",
    fileSize: "1.5 MB",
    status: "pending",
    validationStatus: "unverified",
    driveFileId: "drive_file_id_104",
  },
  {
    id: "resp_005",
    candidateName: "Pedro Rocha",
    email: "pedro.rocha@example.com",
    submittedAt: "2026-05-11T13:20:00Z",
    fileName: "resume.docx",
    fileSize: "500 KB",
    status: "error",
    validationStatus: "invalid",
    driveFileId: "drive_file_id_105",
    errorMessage: "Formato inválido. Apenas arquivos PDF são aceitos.",
  },
];
