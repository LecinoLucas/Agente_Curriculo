import React, { useState } from "react";
import { 
  CheckSquare, 
  Calendar, 
  Users, 
  MessageSquare, 
  Clock, 
  ClipboardList, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  ArrowRight,
  User,
  Plus,
  Star,
  Download
} from "lucide-react";

export function InterviewTab() {
  // Mock data for the interview phase
  const [checklist, setChecklist] = useState([
    { id: 1, label: "Revisão curricular concluída", completed: true },
    { id: 2, label: "Disponibilidade confirmada", completed: true },
    { id: 3, label: "Link da sala de entrevista enviado", completed: true },
    { id: 4, label: "Realizar entrevista técnica", completed: false },
    { id: 5, label: "Preencher ficha de avaliação", completed: false },
  ]);

  const toggleCheckitem = (id: number) => {
    setChecklist(current =>
      current.map(item =>
        item.id === id ? { ...item, completed: !item.completed } : item
      )
    );
  };

  return (
    <div className="flex flex-col gap-6 p-5 overflow-y-auto max-h-[calc(100vh-200px)]">
      
      {/* 8. Resumo Executivo no Topo (Mais compacto) */}
      <div className="bg-[hsl(var(--surface-muted))]/45 border border-[hsl(var(--border))]/50 rounded-2xl p-3 flex items-center justify-between gap-4">
        <p className="text-xs text-[hsl(var(--text))] leading-relaxed flex-1">
          <strong>Resumo:</strong> Excelente domínio técnico em competências essenciais. Comunicação clara e boa sinergia cultural preliminar.
        </p>
        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 shrink-0 bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-1 rounded-full">
          <Star className="h-3 w-3 fill-emerald-500" /> Perfil Forte
        </span>
      </div>

      {/* 5. Próxima Ação Destacada */}
      <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-2xl p-3.5 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="bg-blue-500 text-white p-2 rounded-full shrink-0">
            <Calendar className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-blue-900 dark:text-blue-300">PRÓXIMA AÇÃO</h4>
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">Realizar Entrevista Técnica</p>
          </div>
        </div>
        <button className="flex items-center gap-1 text-xs font-bold text-blue-700 dark:text-blue-300 hover:text-blue-800 transition bg-white dark:bg-slate-800 px-3 py-1.5 rounded-lg shadow-sm border border-blue-200 dark:border-blue-900/50">
          Agendar <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Left/Main Column (2/3) */}
        <div className="md:col-span-2 space-y-6">
          
          {/* 1. Timeline da Candidatura */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-[hsl(var(--text))] flex items-center gap-2">
              <Clock className="h-4 w-4 text-[hsl(var(--text-muted))]" /> Timeline do Processo
            </h3>
            
            <div className="border border-[hsl(var(--border))]/50 rounded-2xl p-4 space-y-5">
              {/* Timeline Item */}
              <div className="flex gap-3 relative">
                <div className="absolute left-2.5 top-6 bottom-0 w-0.5 bg-slate-200 dark:bg-slate-700 z-0"></div>
                <div className="z-10 bg-emerald-500 text-white rounded-full p-1 h-5 w-5 flex items-center justify-center text-[10px] shrink-0">✓</div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[hsl(var(--text))]">Triagem Inicial</span>
                    <span className="text-[10px] text-[hsl(var(--text-muted))] font-medium">10/05/2026</span>
                  </div>
                  <p className="text-xs text-[hsl(var(--text-muted))] mt-0.5">Aprovado pelo recrutador com 85% de aderência técnica.</p>
                </div>
              </div>

              {/* Timeline Item */}
              <div className="flex gap-3 relative">
                <div className="z-10 bg-blue-500 text-white rounded-full p-1 h-5 w-5 flex items-center justify-center text-[10px] animate-pulse shrink-0">●</div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400">Entrevista Técnica c/ Engenharia</span>
                    <span className="text-[10px] bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 px-1.5 py-0.5 rounded-full font-medium">Agendado</span>
                  </div>
                  <p className="text-xs text-[hsl(var(--text-muted))] mt-0.5">Entrevista agendada para o dia 12/05 às 14:00h.</p>
                </div>
              </div>
            </div>
          </div>

          {/* 4. Bloco de Feedback do Entrevistador */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-[hsl(var(--text))] flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-[hsl(var(--text-muted))]" /> Feedbacks das Avaliações
              </h3>
              <button className="text-xs text-blue-600 dark:text-blue-400 font-medium hover:underline flex items-center gap-1">
                <Plus className="h-3 w-3" /> Adicionar
              </button>
            </div>
            
            <div className="space-y-3">
              {/* Feedback Card */}
              <div className="border border-[hsl(var(--border))]/50 rounded-2xl p-4 bg-[hsl(var(--background))]">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <div className="bg-slate-200 dark:bg-slate-700 p-1.5 rounded-full">
                      <User className="h-3 w-3" />
                    </div>
                    <div>
                      <span className="text-xs font-bold block">Lucas Peixoto</span>
                      <span className="text-[10px] text-[hsl(var(--text-muted))]">Recrutador Sênior</span>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Aprovar</span>
                </div>
                <p className="text-xs text-[hsl(var(--text))] leading-relaxed">
                  "O candidato se expressou muito bem. Tem uma sólida experiência prática com React e Node.js. Respondeu com segurança sobre os desafios de performance que enfrentou em projetos anteriores."
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (1/3) */}
        <div className="md:col-span-1 space-y-6">
          
          {/* 6. Checklist da Etapa */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-[hsl(var(--text))] flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-[hsl(var(--text-muted))]" /> Checklist
            </h3>
            <div className="border border-[hsl(var(--border))]/50 rounded-2xl p-4 space-y-2.5">
              {checklist.map(item => (
                <div key={item.id} className="flex items-center gap-2 cursor-pointer" onClick={() => toggleCheckitem(item.id)}>
                  <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${item.completed ? "bg-emerald-500 border-emerald-500 text-white" : "border-[hsl(var(--text-muted))]"}`}>
                    {item.completed && <CheckCircle className="h-3 w-3 fill-white text-emerald-500" />}
                  </div>
                  <span className={`text-xs ${item.completed ? "text-[hsl(var(--text-muted))] line-through" : "text-[hsl(var(--text))]"}`}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 7. Espaço para Múltiplos Avaliadores */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-[hsl(var(--text))] flex items-center gap-2">
              <Users className="h-4 w-4 text-[hsl(var(--text-muted))]" /> Avaliadores
            </h3>
            <div className="border border-[hsl(var(--border))]/50 rounded-2xl p-4 space-y-3">
              {/* Avaliador */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="bg-slate-200 dark:bg-slate-700 p-1.5 rounded-full">
                    <User className="h-3 w-3" />
                  </div>
                  <span className="text-xs font-medium">Lecino Lucas</span>
                </div>
                <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-[hsl(var(--text-muted))] px-2 py-0.5 rounded-full">Owner</span>
              </div>
              {/* Avaliador */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="bg-slate-200 dark:bg-slate-700 p-1.5 rounded-full">
                    <User className="h-3 w-3" />
                  </div>
                  <span className="text-xs font-medium">Marina Souza</span>
                </div>
                <span className="text-[10px] bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400 px-2 py-0.5 rounded-full">Avaliou</span>
              </div>
              <button className="w-full text-center text-xs text-blue-600 dark:text-blue-400 font-medium hover:underline flex items-center justify-center gap-1 mt-2">
                <Plus className="h-3 w-3" /> Adicionar Avaliador
              </button>
            </div>
          </div>

          {/* 3. Bloco de Decisão (Mais destaque) */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-[hsl(var(--text))] flex items-center gap-2">
              <CheckSquare className="h-4 w-4 text-[hsl(var(--text-muted))]" /> Decisão da Etapa
            </h3>
            <div className="bg-[hsl(var(--surface-muted))]/45 border border-[hsl(var(--border))]/50 rounded-2xl p-4 space-y-2.5">
              <button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2.5 rounded-xl transition shadow-sm flex items-center justify-center gap-1">
                Aprovar para Próxima Etapa <CheckCircle className="h-3 w-3" />
              </button>
              <button className="w-full border border-[hsl(var(--border))] bg-[hsl(var(--surface))] hover:bg-[hsl(var(--surface-muted))] text-[hsl(var(--text))] text-xs font-bold py-2.5 rounded-xl transition">
                Marcar Standby
              </button>
              <button className="w-full border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-900/10 dark:text-rose-400 text-xs font-bold py-2.5 rounded-xl transition">
                Reprovar Candidato
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
