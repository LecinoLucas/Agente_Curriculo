import { useState } from "react";
import {
  Sparkles,
  MessageSquare,
  BarChart,
  UserCheck,
  CheckCircle2,
  FileText,
  BrainCircuit,
  Bot,
  LineChart,
  Search,
  Briefcase,
  Kanban,
  Smartphone,
  Send,
  Mic,
  DownloadCloud
} from "lucide-react";

export function Demo2Page() {
  const [activeTab, setActiveTab] = useState("triagem");

  const tabs = [
    { id: "triagem", label: "Triagem Inteligente", icon: <Sparkles className="w-4 h-4" /> },
    { id: "entrevista", label: "Entrevista Automática", icon: <MessageSquare className="w-4 h-4" /> },
    { id: "matching", label: "Matching de Perfil", icon: <BarChart className="w-4 h-4" /> },
    { id: "decisao", label: "Apoio à Decisão", icon: <UserCheck className="w-4 h-4" /> },
    { id: "metricas", label: "Analytics (Substitui Excel)", icon: <LineChart className="w-4 h-4" /> },
    { id: "busca", label: "Busca Semântica", icon: <Search className="w-4 h-4" /> },
    { id: "vagas", label: "Geração de Vagas", icon: <Briefcase className="w-4 h-4" /> },
    { id: "pipeline", label: "Pipeline Automatizado", icon: <Kanban className="w-4 h-4" /> },
    { id: "candidato", label: "Visão do Candidato (WhatsApp)", icon: <Smartphone className="w-4 h-4" /> },
  ];

  return (
    <div className="flex flex-col h-full bg-slate-50 min-h-[calc(100vh-theme(spacing.24))] rounded-xl">
      {/* Header */}
      <div className="bg-white px-8 py-8 border-b border-gray-200">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg">
            <BrainCircuit className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Demonstração: Recrutamento IA Moderno</h1>
        </div>
        <p className="text-gray-500 max-w-2xl">
          Apresentação do fluxo de contratação end-to-end potencializado por Inteligência Artificial.
          Visualize como a plataforma reduz o tempo de triagem e melhora a qualidade da contratação.
        </p>
      </div>

      {/* Tabs */}
      <div className="px-4 sm:px-8 mt-6 w-full">
        <nav className="flex overflow-x-auto gap-1 p-1 bg-gray-100 rounded-xl w-full pb-1" style={{ scrollbarWidth: 'none' }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                activeTab === tab.id
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-200"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content Area */}
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-5xl bg-white rounded-2xl shadow-sm border border-gray-100 p-8 min-h-[500px]">
          
          {/* TAB: TRIAGEM INTELIGENTE */}
          {activeTab === "triagem" && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" />
                Leitura e Extração Instantânea
              </h2>
              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div className="p-4 border border-dashed border-gray-300 rounded-xl bg-gray-50 flex flex-col items-center justify-center h-48">
                    <FileText className="w-10 h-10 text-gray-400 mb-2" />
                    <p className="text-sm font-medium text-gray-600">curriculo_joao_silva.pdf</p>
                    <p className="text-xs text-gray-400">Enviado há 2 minutos</p>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-indigo-700 font-medium bg-indigo-50 p-3 rounded-lg shadow-sm border border-indigo-100">
                    <Sparkles className="w-4 h-4 animate-pulse" />
                    IA analisando mais de 40 pontos de dados...
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <div className="bg-white p-3 rounded-lg text-center border border-gray-200 shadow-sm relative overflow-hidden group">
                      <div className="absolute top-0 left-0 w-full h-1 bg-red-400" />
                      <p className="text-[9px] text-gray-500 uppercase font-bold tracking-wider mb-1">Processo Manual</p>
                      <p className="text-xl font-black text-gray-800">40 min</p>
                      <p className="text-xs text-gray-500 mt-1">Lendo currículo</p>
                      <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] hidden group-hover:flex items-center justify-center">
                        <span className="text-xs font-bold text-red-600">Obsoleto</span>
                      </div>
                    </div>
                    <div className="bg-emerald-50 p-3 rounded-lg text-center border border-emerald-200 shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500" />
                      <p className="text-[9px] text-emerald-700 uppercase font-bold tracking-wider mb-1">Assistente IA</p>
                      <p className="text-xl font-black text-emerald-800">2 seg</p>
                      <p className="text-xs text-emerald-600 mt-1">Extração automática</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="bg-white border border-gray-200 p-5 rounded-xl shadow-sm">
                    <h3 className="font-semibold text-gray-900 mb-4 border-b pb-2">Dados Estruturados</h3>
                    <ul className="space-y-3">
                      <li className="flex justify-between items-center text-sm">
                        <span className="text-gray-500">Cargo Anterior</span>
                        <span className="font-medium">Assistente Logístico</span>
                      </li>
                      <li className="flex justify-between items-center text-sm">
                        <span className="text-gray-500">Tempo de Experiência</span>
                        <span className="font-medium">3 anos e 2 meses</span>
                      </li>
                      <li className="flex justify-between items-center text-sm">
                        <span className="text-gray-500">Habilidades Técnicas</span>
                        <span className="flex gap-1">
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-md text-xs">Excel</span>
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-md text-xs">SAP</span>
                        </span>
                      </li>
                      <li className="flex justify-between items-center text-sm">
                        <span className="text-gray-500">Alerta</span>
                        <span className="text-amber-600 font-medium flex items-center gap-1">
                          Distância \u003e 30km
                        </span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: ENTREVISTA AUTOMÁTICA */}
          {activeTab === "entrevista" && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                <Bot className="w-5 h-5 text-indigo-600" />
                Interação Ativa via WhatsApp / Web
              </h2>

              <div className="flex flex-col lg:flex-row gap-6">
                <div className="flex-1 max-w-lg bg-[#efeae2] rounded-2xl border border-gray-200 overflow-hidden flex flex-col h-[400px]" style={{ backgroundImage: "url('https://i.imgur.com/7w3kM7c.png')", backgroundSize: 'cover', backgroundBlendMode: 'overlay' }}>
                  <div className="bg-emerald-600 p-4 border-b flex justify-between items-center shadow-md z-10">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white">
                        <Bot className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-bold text-sm text-white">Assistente Marajó</p>
                        <p className="text-xs text-emerald-100">Online</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 p-4 overflow-y-auto space-y-4">
                    <div className="flex gap-3">
                      <div className="bg-white border border-gray-100 p-3 rounded-2xl rounded-tl-none text-sm text-gray-800 shadow-sm max-w-[85%] relative">
                        Olá João! Vi que você tem 3 anos de experiência em logística. Para a vaga de Conferente, você precisaria trabalhar no turno da noite. Você tem disponibilidade?
                        <span className="text-[9px] text-gray-400 absolute bottom-1 right-2">02:14</span>
                      </div>
                    </div>
                    <div className="flex gap-3 flex-row-reverse">
                      <div className="bg-[#dcf8c6] border border-[#c3e8a9] text-gray-800 p-3 rounded-2xl rounded-tr-none text-sm shadow-sm max-w-[85%] relative pr-6">
                        Sim, tenho total disponibilidade de horário, inclusive madrugada.
                        <div className="absolute bottom-1 right-1.5 flex items-center gap-0.5">
                          <span className="text-[9px] text-gray-500">02:16</span>
                          <CheckCircle2 className="w-3 h-3 text-blue-500" />
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <div className="bg-white border border-gray-100 p-3 rounded-2xl rounded-tl-none text-sm text-gray-800 shadow-sm max-w-[85%] relative">
                        Ótimo! Outra pergunta: qual foi o maior volume de carga que você já gerenciou em um único turno?
                        <span className="text-[9px] text-gray-400 absolute bottom-1 right-2">02:16</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex-1 flex flex-col justify-center gap-4">
                  <div className="bg-indigo-50 border border-indigo-100 p-5 rounded-2xl">
                    <h3 className="font-black text-indigo-900 text-lg mb-2 flex items-center gap-2"><Bot className="text-indigo-600" /> Entrevista 24/7</h3>
                    <p className="text-sm text-gray-700">O RH não precisa mais passar o dia inteiro no telefone. A IA conduz entrevistas <strong>a qualquer hora</strong> (neste exemplo, às 02:14 da manhã), filtrando candidatos desqualificados automaticamente.</p>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-100 p-5 rounded-2xl">
                    <h3 className="font-black text-emerald-900 text-lg mb-2 flex items-center gap-2"><CheckCircle2 className="text-emerald-600" /> Tempo Salvo</h3>
                    <p className="text-sm text-gray-700">Em vez de agendar dezenas de calls, o gestor já acorda com os melhores candidatos pré-entrevistados e avaliados em texto estruturado.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: MATCHING DE PERFIL */}
          {activeTab === "matching" && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                <BarChart className="w-5 h-5 text-indigo-600" />
                Score de Compatibilidade
              </h2>
              <div className="grid grid-cols-3 gap-6">
                <div className="col-span-1 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-6 text-white flex flex-col justify-center items-center">
                  <p className="text-indigo-100 font-medium mb-2">Match Global</p>
                  <div className="text-6xl font-extrabold mb-2">87%</div>
                  <p className="text-sm text-indigo-100 text-center">
                    Candidato altamente recomendado para a vaga de Conferente.
                  </p>
                </div>
                <div className="col-span-2 space-y-5">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-gray-700">Requisitos Técnicos</span>
                      <span className="text-green-600 font-bold">95%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div className="bg-green-500 h-2 rounded-full" style={{ width: "95%" }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-gray-700">Cultura e Comportamento</span>
                      <span className="text-indigo-600 font-bold">82%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div className="bg-indigo-500 h-2 rounded-full" style={{ width: "82%" }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-gray-700">Localização e Logística</span>
                      <span className="text-amber-500 font-bold">60%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div className="bg-amber-400 h-2 rounded-full" style={{ width: "60%" }} />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Candidato reside em outra cidade limítrofe.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: APOIO À DECISÃO */}
          {activeTab === "decisao" && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-indigo-600" />
                Dossiê do Gestor
              </h2>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
                <div className="flex justify-between items-start mb-6 border-b border-slate-200 pb-4">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Resumo da IA</h3>
                    <p className="text-sm text-gray-500">Gerado automaticamente após entrevista inicial</p>
                  </div>
                  <div className="flex items-center gap-2 text-green-700 bg-green-50 px-3 py-1 rounded-full text-sm font-medium border border-green-200">
                    <CheckCircle2 className="w-4 h-4" />
                    Aprovado na Triagem
                  </div>
                </div>
                
                <div className="prose prose-sm max-w-none text-gray-700">
                  <p>
                    <strong>Pontos Fortes:</strong> O candidato demonstra forte resiliência e adaptação a ambientes de alta pressão. Comprovou domínio em sistemas ERP logísticos e tem total disponibilidade de horário.
                  </p>
                  <p>
                    <strong>Pontos de Atenção:</strong> A distância de sua residência até a base operacional é de aproximadamente 32km, o que pode impactar na pontualidade a longo prazo se depender de transporte público.
                  </p>
                  <p>
                    <strong>Sugestão para Entrevista Presencial:</strong> 
                    <ul className="mt-2 list-disc pl-4 text-indigo-800">
                      <li>Questionar sobre a logística de deslocamento diário.</li>
                      <li>Simular um cenário de atraso de carga para testar reação sob stress.</li>
                    </ul>
                  </p>
                </div>

                <div className="mt-6 flex justify-end gap-3">
                  <button className="px-4 py-2 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50">
                    Reprovar
                  </button>
                  <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 shadow-sm">
                    Avançar para Gestor
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB: MÉTRICAS EM TEMPO REAL */}
          {activeTab === "metricas" && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <LineChart className="w-5 h-5 text-indigo-600" />
                  Analytics Integrado
                </h2>
                <div className="bg-red-50 text-red-700 text-xs font-bold px-2 py-1 rounded border border-red-100 flex items-center gap-1">
                  Adeus Planilhas!
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
                  <p className="text-xs text-indigo-600 font-bold uppercase tracking-wider mb-1">Tempo Médio Contratação</p>
                  <p className="text-2xl font-black text-indigo-900">4 dias</p>
                  <p className="text-xs text-green-600 mt-2 font-medium">↓ 60% vs. Planilhas Manuais</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                  <p className="text-xs text-emerald-600 font-bold uppercase tracking-wider mb-1">Custo por Contratação</p>
                  <p className="text-2xl font-black text-emerald-900">R$ 145</p>
                  <p className="text-xs text-emerald-600 mt-2 font-medium">Economia de 30%</p>
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                  <p className="text-xs text-amber-600 font-bold uppercase tracking-wider mb-1">Taxa de Conversão</p>
                  <p className="text-2xl font-black text-amber-900">12%</p>
                  <p className="text-xs text-amber-600 mt-2 font-medium">De 120 candidatos, 14 finalistas</p>
                </div>
              </div>

              <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl p-5 text-white mb-6 flex items-center justify-between shadow-md">
                <div>
                  <p className="text-emerald-100 text-sm font-bold uppercase tracking-wider mb-1">Economia Gerada no Mês</p>
                  <h3 className="text-3xl font-black">R$ 12.450,00</h3>
                  <p className="text-sm mt-1 text-emerald-50">Equivalente a 160 horas poupadas de trabalho manual de RH e redução de Turnover.</p>
                </div>
                <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center shrink-0">
                  <LineChart className="w-8 h-8 text-white" />
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <h3 className="font-bold text-gray-800 mb-4">Funil de Recrutamento (Vaga: Operador de Caixa)</h3>
                <div className="space-y-3">
                  <div className="flex items-center">
                    <div className="w-24 text-sm text-gray-500">Inscritos</div>
                    <div className="flex-1">
                      <div className="h-6 bg-blue-100 rounded flex items-center px-3" style={{ width: "100%" }}>
                        <span className="text-xs font-bold text-blue-800">120 (100%)</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <div className="w-24 text-sm text-gray-500">Aprov. Triagem</div>
                    <div className="flex-1">
                      <div className="h-6 bg-indigo-100 rounded flex items-center px-3" style={{ width: "70%" }}>
                        <span className="text-xs font-bold text-indigo-800">84 (70%)</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <div className="w-24 text-sm text-gray-500">Entrev. IA</div>
                    <div className="flex-1">
                      <div className="h-6 bg-purple-100 rounded flex items-center px-3" style={{ width: "40%" }}>
                        <span className="text-xs font-bold text-purple-800">48 (40%)</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <div className="w-24 text-sm text-gray-500">Finalistas</div>
                    <div className="flex-1">
                      <div className="h-6 bg-green-100 rounded flex items-center px-3" style={{ width: "12%" }}>
                        <span className="text-xs font-bold text-green-800">14 (12%)</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: BUSCA SEMÂNTICA */}
          {activeTab === "busca" && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                <Search className="w-5 h-5 text-indigo-600" />
                Busca de Talentos por Linguagem Natural
              </h2>
              
              <div className="bg-indigo-50 border-indigo-200 border rounded-xl p-6 mb-6">
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Search className="w-5 h-5 absolute left-3 top-3 text-indigo-400" />
                    <input 
                      type="text" 
                      className="w-full pl-10 pr-4 py-3 rounded-lg border-none shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none text-gray-800 font-medium bg-white"
                      value="Encontre candidatos que trabalharam em supermercados à noite e têm moto própria"
                      readOnly
                    />
                  </div>
                  <button className="bg-indigo-600 text-white px-6 py-3 rounded-lg font-bold shadow-sm flex items-center gap-2">
                    <Sparkles className="w-4 h-4" /> Buscar
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-sm font-bold text-gray-500">2 candidatos altamente compatíveis encontrados no seu banco (Sem precisar dar Ctrl+F em planilhas!)</p>
                
                <div className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-xl shadow-sm hover:border-indigo-300 transition-colors cursor-pointer">
                  <div className="flex gap-4 items-center">
                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xl">MC</div>
                    <div>
                      <h4 className="font-bold text-gray-900">Marcos Costa</h4>
                      <p className="text-sm text-gray-500">Ex-Repositor no Carrefour • Turno da Madrugada</p>
                      <div className="flex gap-2 mt-2">
                        <span className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded text-xs font-bold">Tem Moto</span>
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-xs font-bold">Disp. Noturna</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-indigo-600 font-bold bg-indigo-50 px-3 py-1 rounded-full text-sm">
                    Match 98%
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-xl shadow-sm hover:border-indigo-300 transition-colors cursor-pointer">
                  <div className="flex gap-4 items-center">
                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xl">AS</div>
                    <div>
                      <h4 className="font-bold text-gray-900">Ana Souza</h4>
                      <p className="text-sm text-gray-500">Auxiliar de Estoque na Rede Atacadão</p>
                      <div className="flex gap-2 mt-2">
                        <span className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded text-xs font-bold">Tem Moto</span>
                        <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-xs font-bold">Precisa de Flexibilidade</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-indigo-600 font-bold bg-indigo-50 px-3 py-1 rounded-full text-sm">
                    Match 85%
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: GERAÇÃO DE VAGAS */}
          {activeTab === "vagas" && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-indigo-600" />
                Geração de Vagas Automatizada
              </h2>
              
              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-4">
                  <p className="text-sm text-gray-600 font-medium">Descreva o que você precisa em linguagem simples (como se falasse com a sua equipe no WhatsApp):</p>
                  <textarea 
                    className="w-full h-32 p-4 bg-yellow-50 border border-yellow-200 rounded-xl text-yellow-900 font-medium outline-none resize-none"
                    readOnly
                    value="Preciso abrir uma vaga para frentista no posto Bandeira. Tem que ter CNH A porque vai precisar fazer uns corres de moto às vezes. De preferência alguém que já trabalhou com atendimento ao público."
                  />
                  <button className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold shadow-sm flex items-center justify-center gap-2">
                    <Sparkles className="w-4 h-4" /> Gerar Vaga Completa com IA
                  </button>
                </div>
                
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-500" />
                  <p className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-3">Documento Gerado Oficial</p>
                  
                  <h3 className="text-lg font-black text-gray-900 mb-2">Frentista Atendente (Com CNH A)</h3>
                  <div className="space-y-3 text-sm text-gray-700">
                    <p><strong>Local:</strong> Posto Bandeira</p>
                    <p><strong>Descrição:</strong> Procuramos um profissional dinâmico para atuar no atendimento direto aos nossos clientes. Além de operar bombas de combustível, o colaborador realizará eventuais deslocamentos logísticos curtos utilizando motocicleta da empresa.</p>
                    <p><strong>Requisitos Obrigatórios:</strong></p>
                    <ul className="list-disc pl-4 space-y-1">
                      <li>CNH Categoria A (Motocicleta) regularizada.</li>
                      <li>Experiência comprovada com atendimento ao público.</li>
                    </ul>
                  </div>
                  
                  <div className="mt-6 flex justify-end gap-2">
                    <button className="px-3 py-1.5 text-xs font-bold text-gray-600 bg-gray-200 rounded hover:bg-gray-300">Editar</button>
                    <button className="px-3 py-1.5 text-xs font-bold text-white bg-green-600 rounded shadow-sm flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Publicar no Portal</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: PIPELINE / KANBAN */}
          {activeTab === "pipeline" && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <Kanban className="w-5 h-5 text-indigo-600" />
                  Gestão Visual do Recrutamento (Pipeline Inteligente)
                </h2>
                <div className="bg-indigo-50 text-indigo-700 text-xs font-bold px-3 py-1.5 rounded-full border border-indigo-100 flex items-center gap-1 shadow-sm">
                  <Sparkles className="w-3 h-3" /> Movimentação Automática por IA
                </div>
              </div>
              
              <div className="grid grid-cols-4 gap-4 h-[400px] overflow-hidden">
                
                {/* Coluna 1: Novas Candidaturas */}
                <div className="bg-slate-100/80 rounded-xl flex flex-col p-3 border border-slate-200">
                  <div className="flex justify-between items-center mb-3 px-1">
                    <span className="font-bold text-sm text-slate-700">Novos (Triagem IA)</span>
                    <span className="bg-slate-200 text-slate-600 text-xs px-2 py-0.5 rounded-full font-bold">12</span>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-3">
                    <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm opacity-50">
                      <p className="font-bold text-sm text-gray-800">Pedro Santos</p>
                      <p className="text-xs text-gray-500 mb-2">Frentista • Há 5 min</p>
                      <div className="flex items-center gap-1 text-xs text-indigo-600 font-medium bg-indigo-50 px-2 py-1 rounded">
                        <Sparkles className="w-3 h-3 animate-pulse" /> Lendo CV...
                      </div>
                    </div>
                  </div>
                </div>

                {/* Coluna 2: Entrevista Assistente */}
                <div className="bg-blue-50/50 rounded-xl flex flex-col p-3 border border-blue-100">
                  <div className="flex justify-between items-center mb-3 px-1">
                    <span className="font-bold text-sm text-blue-800">Entrevista IA</span>
                    <span className="bg-blue-200 text-blue-700 text-xs px-2 py-0.5 rounded-full font-bold">4</span>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-3">
                    <div className="bg-white p-3 rounded-lg border border-blue-200 shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
                      <p className="font-bold text-sm text-gray-800 pl-2">Maria Lima</p>
                      <p className="text-xs text-gray-500 mb-2 pl-2">Operadora de Caixa</p>
                      <div className="flex justify-between items-center mt-2 pl-2">
                        <span className="text-xs text-blue-600 font-medium">Respondendo no Web...</span>
                        <Bot className="w-4 h-4 text-blue-400" />
                      </div>
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-blue-200 shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
                      <p className="font-bold text-sm text-gray-800 pl-2">João Costa</p>
                      <p className="text-xs text-gray-500 mb-2 pl-2">Frentista</p>
                      <div className="flex justify-between items-center mt-2 pl-2">
                        <span className="text-xs text-green-600 font-medium">Respondendo no WhatsApp</span>
                        <Bot className="w-4 h-4 text-blue-400" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Coluna 3: Para Revisão do Gestor */}
                <div className="bg-amber-50/50 rounded-xl flex flex-col p-3 border border-amber-100">
                  <div className="flex justify-between items-center mb-3 px-1">
                    <span className="font-bold text-sm text-amber-800">Decisão Gestor</span>
                    <span className="bg-amber-200 text-amber-800 text-xs px-2 py-0.5 rounded-full font-bold">2</span>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-3">
                    <div className="bg-white p-3 rounded-lg border border-amber-200 shadow-sm ring-2 ring-indigo-500/20 transition-all hover:-translate-y-1 cursor-pointer">
                      <div className="flex justify-between items-start mb-1">
                        <p className="font-bold text-sm text-gray-900">Marcos Silva</p>
                        <span className="text-xs font-black text-white bg-green-500 px-1.5 rounded">98%</span>
                      </div>
                      <p className="text-xs text-gray-500 mb-3">Assistente de Loja</p>
                      <div className="w-full bg-amber-100 text-amber-800 text-xs text-center py-1 rounded font-medium">
                        Aguardando Aprovação
                      </div>
                    </div>
                  </div>
                </div>

                {/* Coluna 4: Pré-Admissão */}
                <div className="bg-emerald-50/50 rounded-xl flex flex-col p-3 border border-emerald-100">
                  <div className="flex justify-between items-center mb-3 px-1">
                    <span className="font-bold text-sm text-emerald-800">Admissão</span>
                    <span className="bg-emerald-200 text-emerald-800 text-xs px-2 py-0.5 rounded-full font-bold">1</span>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-3">
                    <div className="bg-white p-3 rounded-lg border border-emerald-200 shadow-sm opacity-90">
                      <p className="font-bold text-sm text-gray-800">Ana Souza</p>
                      <p className="text-xs text-gray-500 mb-2">Frentista</p>
                      <div className="w-full bg-emerald-100 text-emerald-800 text-xs text-center py-1 rounded font-medium mb-2">
                        Coletando Docs Autom.
                      </div>
                      <button className="w-full flex items-center justify-center gap-1 bg-emerald-600 text-white text-xs font-bold py-1.5 rounded hover:bg-emerald-700 transition-colors shadow-sm">
                        <DownloadCloud className="w-3 h-3" />
                        Exportar Admissão
                      </button>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* TAB: VISÃO DO CANDIDATO */}
          {activeTab === "candidato" && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 flex justify-center">
              <div className="w-full max-w-[360px] bg-slate-100 rounded-[2.5rem] border-[8px] border-slate-800 h-[600px] flex flex-col overflow-hidden relative shadow-2xl">
                
                {/* Status Bar Fake */}
                <div className="bg-slate-800 text-white flex justify-between items-center px-6 py-1.5 text-[10px] font-medium opacity-90">
                  <span>9:41</span>
                  <div className="flex gap-1.5 items-center">
                    <span className="w-3 h-3 rounded-full bg-white/80"></span>
                  </div>
                </div>

                {/* App Header */}
                <div className="bg-emerald-600 text-white px-4 py-3 flex items-center gap-3 shadow-md z-10">
                  <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                    <Bot className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm leading-tight">Marajó RH - Assistente</h3>
                    <p className="text-[10px] text-emerald-100 opacity-90">Online</p>
                  </div>
                </div>

                {/* Chat Background */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#efeae2]" style={{ backgroundImage: "url('https://i.imgur.com/7w3kM7c.png')", backgroundSize: 'cover', backgroundBlendMode: 'overlay' }}>
                  
                  {/* Date badge */}
                  <div className="flex justify-center">
                    <span className="bg-emerald-100/80 text-emerald-800 text-[10px] px-2 py-0.5 rounded-full shadow-sm">Hoje</span>
                  </div>

                  {/* Msg 1 - Bot */}
                  <div className="flex justify-start">
                    <div className="bg-white rounded-2xl rounded-tl-sm px-3 py-2 max-w-[85%] shadow-sm relative">
                      <p className="text-sm text-gray-800">Olá! 👋 Sou a assistente de recrutamento da Rede Marajó.</p>
                      <p className="text-sm text-gray-800 mt-1">Para começar de forma rápida e <b>sem precisar de senhas</b>, por favor digite o seu CPF (apenas números).</p>
                      <span className="text-[9px] text-gray-400 absolute bottom-1 right-2">09:41</span>
                    </div>
                  </div>

                  {/* Msg 2 - User */}
                  <div className="flex justify-end">
                    <div className="bg-[#dcf8c6] rounded-2xl rounded-tr-sm px-3 py-2 max-w-[85%] shadow-sm relative">
                      <p className="text-sm text-gray-800 pr-5">12345678900</p>
                      <div className="absolute bottom-1 right-1.5 flex items-center gap-0.5">
                        <span className="text-[9px] text-gray-500">09:42</span>
                        <CheckCircle2 className="w-3 h-3 text-blue-500" />
                      </div>
                    </div>
                  </div>
                  
                  {/* Fake Audio Msg - User */}
                  <div className="flex justify-end">
                    <div className="bg-[#dcf8c6] rounded-2xl rounded-tr-sm p-2 shadow-sm relative flex items-center gap-2 pr-6">
                      <div className="w-7 h-7 bg-emerald-500 rounded-full flex items-center justify-center shrink-0">
                        <Mic className="w-4 h-4 text-white" />
                      </div>
                      <div className="w-24 h-1 bg-emerald-700/20 rounded-full overflow-hidden">
                        <div className="w-1/2 h-full bg-emerald-600" />
                      </div>
                      <p className="text-[10px] text-gray-500 font-medium">0:12</p>
                      <div className="absolute bottom-1 right-1.5 flex items-center gap-0.5">
                        <CheckCircle2 className="w-3 h-3 text-blue-500" />
                      </div>
                    </div>
                  </div>

                  {/* Msg 3 - Bot */}
                  <div className="flex justify-start">
                    <div className="bg-white rounded-2xl rounded-tl-sm px-3 py-2 max-w-[85%] shadow-sm relative pb-4">
                      <p className="text-sm text-gray-800">Legal, João! Vi aqui que temos vagas na sua região.</p>
                      <p className="text-sm text-gray-800 mt-1">Você prefere trabalhar como Frentista ou na Loja de Conveniência?</p>
                      <span className="text-[9px] text-gray-400 absolute bottom-1 right-2">09:42</span>
                    </div>
                  </div>

                  {/* Quick Replies (Botões Whatsapp/Chat) */}
                  <div className="flex flex-col gap-2 pl-4 pr-12">
                    <button className="bg-white border border-emerald-500 text-emerald-700 text-sm font-medium py-2 rounded-xl shadow-sm text-center hover:bg-emerald-50 transition-colors">
                      Frentista
                    </button>
                    <button className="bg-white border border-emerald-500 text-emerald-700 text-sm font-medium py-2 rounded-xl shadow-sm text-center hover:bg-emerald-50 transition-colors">
                      Loja (Caixa)
                    </button>
                  </div>
                </div>

                {/* Input Area Fake */}
                <div className="bg-[#f0f0f0] p-2 flex items-center gap-2">
                  <div className="bg-white flex-1 rounded-full px-4 py-2 text-sm text-gray-400">
                    Mensagem
                  </div>
                  <div className="w-10 h-10 bg-emerald-600 rounded-full flex items-center justify-center shrink-0 shadow-sm text-white">
                    <Send className="w-4 h-4 ml-0.5" />
                  </div>
                </div>

              </div>
              
              <div className="ml-8 self-center max-w-sm">
                <div className="bg-indigo-50 border border-indigo-100 p-5 rounded-2xl">
                  <h3 className="font-black text-indigo-900 text-xl mb-3 flex items-center gap-2"><Smartphone className="text-indigo-600" /> Zero Atrito</h3>
                  <ul className="space-y-3">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                      <span className="text-sm text-gray-700"><strong>Sem senhas ou logins complexos:</strong> Identificação rápida por CPF ou WhatsApp.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                      <span className="text-sm text-gray-700"><strong>Linguagem simples:</strong> A IA se adapta a candidatos mais leigos, simulando uma conversa humana no balcão.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                      <span className="text-sm text-gray-700"><strong>Guiado por botões:</strong> O candidato clica nas respostas em vez de precisar digitar tudo.</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
