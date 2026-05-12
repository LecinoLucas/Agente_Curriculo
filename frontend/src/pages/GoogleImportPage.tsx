import React, { useState } from "react";
import { 
  FileText, 
  CheckCircle, 
  XCircle, 
  Clock, 
  RefreshCcw, 
  AlertTriangle, 
  ExternalLink,
  ChevronRight,
  Database,
  Search,
  Filter,
  ArrowRight,
  ClipboardList,
  FolderOpen,
  UserCheck
} from "lucide-react";
import { MOCK_SUBMISSIONS, GoogleFormSubmission } from "../mocks/googleImportMocks";

export function GoogleImportPage() {
  const [submissions, setSubmissions] = useState<GoogleFormSubmission[]>(MOCK_SUBMISSIONS);
  const [selectedSub, setSelectedSub] = useState<GoogleFormSubmission | null>(MOCK_SUBMISSIONS[2]); // Default select processing one

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20";
      case "duplicate": return "text-amber-500 bg-amber-50 dark:bg-amber-900/20";
      case "processing": return "text-blue-500 bg-blue-50 dark:bg-blue-900/20";
      case "pending": return "text-slate-500 bg-slate-50 dark:bg-slate-900/20";
      case "error": return "text-rose-500 bg-rose-50 dark:bg-rose-900/20";
      default: return "text-slate-500 bg-slate-50";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "completed": return "Concluído";
      case "duplicate": return "Duplicado";
      case "processing": return "Processando";
      case "pending": return "Aguardando";
      case "error": return "Erro";
      default: return status;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed": return <CheckCircle className="h-4 w-4" />;
      case "duplicate": return <AlertTriangle className="h-4 w-4" />;
      case "processing": return <RefreshCcw className="h-4 w-4 animate-spin" />;
      case "pending": return <Clock className="h-4 w-4" />;
      case "error": return <XCircle className="h-4 w-4" />;
      default: return null;
    }
  };

  // Helper to render the steps of the flow
  const renderFlowSteps = (sub: GoogleFormSubmission) => {
    const steps = [
      { key: "received", label: "Formulário Recebido", icon: <ClipboardList className="h-5 w-5" /> },
      { key: "detected", label: "Arquivo Detectado", icon: <FolderOpen className="h-5 w-5" /> },
      { key: "validation", label: "Validação", icon: <FileText className="h-5 w-5" /> },
      { key: "deduplication", label: "Deduplicação", icon: <Search className="h-5 w-5" /> },
      { key: "processing", label: "Processamento", icon: <Database className="h-5 w-5" /> },
      { key: "final", label: "Candidato Criado", icon: <UserCheck className="h-5 w-5" /> },
    ];

    // Determine the active step index based on status
    let activeIndex = 0;
    if (sub.status === "completed") activeIndex = 6;
    else if (sub.status === "processing") activeIndex = 4;
    else if (sub.status === "duplicate") activeIndex = 3;
    else if (sub.status === "pending") activeIndex = 1;
    else if (sub.status === "error") activeIndex = sub.validationStatus === "invalid" ? 2 : 1;

    return (
      <div className="mt-6 flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0 w-full overflow-x-auto pb-4">
        {steps.map((step, index) => {
          const isCompleted = index < activeIndex;
          const isCurrent = index === activeIndex;
          const isError = sub.status === "error" && index === activeIndex;
          const isDuplicate = sub.status === "duplicate" && index === 3;

          let iconColor = "text-slate-400";
          let bgColor = "bg-slate-100 dark:bg-slate-800";
          let borderColor = "border-slate-200 dark:border-slate-700";

          if (isCompleted) {
            iconColor = "text-emerald-500";
            bgColor = "bg-emerald-50 dark:bg-emerald-900/20";
            borderColor = "border-emerald-200 dark:border-emerald-900/40";
          } else if (isCurrent) {
            if (isError) {
              iconColor = "text-rose-500";
              bgColor = "bg-rose-50 dark:bg-rose-900/20";
              borderColor = "border-rose-200 dark:border-rose-900/40";
            } else if (isDuplicate) {
              iconColor = "text-amber-500";
              bgColor = "bg-amber-50 dark:bg-amber-900/20";
              borderColor = "border-amber-200 dark:border-amber-900/40";
            } else {
              iconColor = "text-blue-500";
              bgColor = "bg-blue-50 dark:bg-blue-900/20";
              borderColor = "border-blue-200 dark:border-blue-900/40";
            }
          }

          return (
            <React.Fragment key={step.key}>
              <div className="flex flex-col items-center min-w-[120px]">
                <div className={`w-12 h-12 flex items-center justify-center rounded-full border-2 ${bgColor} ${borderColor} ${iconColor} transition-colors duration-300`}>
                  {isCurrent && sub.status === "processing" ? <RefreshCcw className="h-5 w-5 animate-spin" /> : step.icon}
                </div>
                <span className={`mt-2 text-xs font-medium text-center ${isCurrent ? "text-[hsl(var(--text))]" : "text-[hsl(var(--text-muted))]"}`}>
                  {step.label}
                </span>
                {isDuplicate && index === 3 && (
                  <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold mt-1">Duplicado</span>
                )}
                {isError && index === activeIndex && (
                  <span className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold mt-1">Falhou</span>
                )}
              </div>
              
              {index < steps.length - 1 && (
                <div className="hidden md:block flex-1 h-0.5 mx-2 bg-slate-200 dark:bg-slate-700 relative min-w-[30px]">
                  <div 
                    className={`absolute inset-0 transition-all duration-500 ${isCompleted ? "bg-emerald-500" : isCurrent ? "bg-blue-300 dark:bg-blue-700" : ""}`}
                    style={{ width: isCompleted ? "100%" : "0%" }}
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm text-[hsl(var(--text-muted))]">
          <span>Importação</span>
          <ChevronRight className="h-4 w-4" />
          <span>Google Forms / Drive</span>
        </div>
        <h1 className="text-3xl font-bold text-[hsl(var(--text))]">Integração Google Forms / Drive</h1>
        <p className="text-[hsl(var(--text-muted))]">
          Acompanhe em tempo real a entrada de candidatos que preencheram o formulário de inscrição.
        </p>
      </div>

      {/* Alert about Mock */}
      <div className="rounded-3xl border border-blue-200 bg-blue-50 p-6 text-blue-900 dark:border-blue-900/30 dark:bg-blue-900/10 dark:text-blue-200">
        <div className="flex gap-4">
          <AlertTriangle className="h-6 w-6 shrink-0 text-blue-600 dark:text-blue-400" />
          <div>
            <h4 className="font-bold text-blue-800 dark:text-blue-300">Ambiente de Demonstração</h4>
            <p className="mt-1 text-sm opacity-90">
              Esta tela simula o fluxo futuro de integração. Os dados exibidos aqui são mocks locais. 
              As chamadas de API reais para o Google Forms e Google Drive ainda não foram ativadas no backend.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - List of Submissions */}
        <div className="lg:col-span-1 space-y-4">
          <div className="ui-card rounded-3xl p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg">Envios Recebidos</h3>
              <span className="bg-[hsl(var(--surface-muted))] text-[hsl(var(--text-muted))] px-2.5 py-1 rounded-full text-xs font-bold">
                {submissions.length}
              </span>
            </div>

            {/* Search and Filter */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-[hsl(var(--text-muted))]" />
                <input 
                  type="text" 
                  placeholder="Buscar candidato..." 
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button className="p-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] hover:bg-[hsl(var(--surface-muted))]">
                <Filter className="h-4 w-4 text-[hsl(var(--text-muted))]" />
              </button>
            </div>

            {/* List */}
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
              {submissions.map((sub) => (
                <div 
                  key={sub.id}
                  onClick={() => setSelectedSub(sub)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                    selectedSub?.id === sub.id 
                      ? "border-blue-500 bg-blue-50/50 dark:border-blue-700 dark:bg-blue-900/10" 
                      : "border-[hsl(var(--border))] hover:border-[hsl(var(--text-muted))] bg-[hsl(var(--background))]"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex flex-col">
                      <span className="font-bold text-sm text-[hsl(var(--text))]">{sub.candidateName}</span>
                      <span className="text-xs text-[hsl(var(--text-muted))]">{sub.email}</span>
                    </div>
                    <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(sub.status)}`}>
                      {getStatusIcon(sub.status)}
                      <span>{getStatusLabel(sub.status)}</span>
                    </div>
                  </div>
                  <div className="mt-3 flex justify-between items-center text-[10px] text-[hsl(var(--text-muted))] font-medium">
                    <span>{new Date(sub.submittedAt).toLocaleString('pt-BR')}</span>
                    <span className="flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      {sub.fileName}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column - Detail and Flow Visualizer */}
        <div className="lg:col-span-2 space-y-6">
          {selectedSub ? (
            <div className="ui-card rounded-3xl p-6 flex flex-col gap-6">
              {/* Detail Header */}
              <div className="flex flex-col md:flex-row justify-between gap-4 border-b border-[hsl(var(--border))] pb-4">
                <div>
                  <h2 className="text-xl font-bold text-[hsl(var(--text))]">{selectedSub.candidateName}</h2>
                  <p className="text-sm text-[hsl(var(--text-muted))]">{selectedSub.email}</p>
                </div>
                <div className="flex items-center gap-3 self-start">
                  <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(selectedSub.status)}`}>
                    {getStatusIcon(selectedSub.status)}
                    <span>Status: {getStatusLabel(selectedSub.status)}</span>
                  </div>
                  <button className="p-2 text-[hsl(var(--text-muted))] hover:text-[hsl(var(--text))] hover:bg-[hsl(var(--surface-muted))] rounded-full transition-colors">
                    <ExternalLink className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Flow Visualizer */}
              <div>
                <h3 className="font-bold text-lg mb-4">Fluxo de Ingestão</h3>
                <div className="bg-[hsl(var(--surface-muted))] p-6 rounded-2xl">
                  {renderFlowSteps(selectedSub)}
                </div>
              </div>

              {/* Technical Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-[hsl(var(--border))] rounded-2xl p-4">
                  <h4 className="text-sm font-bold mb-2">Metadados do Formulário</h4>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-[hsl(var(--text-muted))]">ID da Resposta:</span>
                      <span className="font-mono">{selectedSub.id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[hsl(var(--text-muted))]">Data de Envio:</span>
                      <span>{new Date(selectedSub.submittedAt).toLocaleString('pt-BR')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[hsl(var(--text-muted))]">Status de Validação:</span>
                      <span className={`font-medium ${selectedSub.validationStatus === 'valid' ? 'text-emerald-500' : selectedSub.validationStatus === 'invalid' ? 'text-rose-500' : 'text-slate-500'}`}>
                        {selectedSub.validationStatus === 'valid' ? 'Válido' : selectedSub.validationStatus === 'invalid' ? 'Inválido' : 'Não verificado'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="border border-[hsl(var(--border))] rounded-2xl p-4">
                  <h4 className="text-sm font-bold mb-2">Detalhes do Arquivo (Drive)</h4>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-[hsl(var(--text-muted))]">ID do Arquivo:</span>
                      <span className="font-mono">{selectedSub.driveFileId}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[hsl(var(--text-muted))]">Nome do Arquivo:</span>
                      <span className="truncate max-w-[150px]" title={selectedSub.fileName}>{selectedSub.fileName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[hsl(var(--text-muted))]">Tamanho:</span>
                      <span>{selectedSub.fileSize}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action and Log Messages */}
              {selectedSub.errorMessage && (
                <div className={`p-4 rounded-xl text-sm flex gap-2 items-center ${selectedSub.status === 'error' ? 'bg-rose-50 text-rose-700 dark:bg-rose-900/10 dark:text-rose-400' : 'bg-amber-50 text-amber-700 dark:bg-amber-900/10 dark:text-amber-400'}`}>
                  {selectedSub.status === 'error' ? <XCircle className="h-5 w-5 shrink-0" /> : <AlertTriangle className="h-5 w-5 shrink-0" />}
                  <span>{selectedSub.errorMessage}</span>
                </div>
              )}

              {selectedSub.status === 'completed' && (
                <div className="p-4 rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-900/10 dark:text-emerald-400 text-sm flex gap-2 items-center">
                  <CheckCircle className="h-5 w-5 shrink-0" />
                  <span>Currículo processado com sucesso. O candidato já está disponível na base principal.</span>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 mt-2">
                {selectedSub.status === 'duplicate' && (
                  <button className="px-4 py-2 text-sm font-medium rounded-xl border border-[hsl(var(--border))] hover:bg-[hsl(var(--surface-muted))] transition-colors">
                    Ignorar Envio
                  </button>
                )}
                <button 
                  className={`px-4 py-2 text-sm font-medium rounded-xl transition-colors ${
                    selectedSub.status === 'completed' 
                      ? "bg-emerald-500 hover:bg-emerald-600 text-white" 
                      : selectedSub.status === 'duplicate'
                      ? "bg-amber-500 hover:bg-amber-600 text-white"
                      : "bg-blue-500 hover:bg-blue-600 text-white"
                  }`}
                >
                  {selectedSub.status === 'completed' ? "Ver Candidato" : selectedSub.status === 'duplicate' ? "Revisar Duplicidade" : "Forçar Processamento"}
                </button>
              </div>
            </div>
          ) : (
            <div className="ui-card rounded-3xl p-6 flex flex-col items-center justify-center min-h-[400px] text-[hsl(var(--text-muted))]">
              <ClipboardList className="h-12 w-12 mb-4 opacity-50" />
              <p>Selecione um envio na lista para ver o detalhamento do fluxo.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
