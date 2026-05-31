import { Link } from 'react-router-dom';
import { ArrowRight, Building2, FileText, HelpCircle, Mail, MapPin, ShieldCheck } from 'lucide-react';
import { CandidatePortalLayout } from '../components/layout/CandidatePortalLayout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

type InstitutionalPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
};

const paragraphClass = 'text-sm leading-6 text-gray-600';
const sectionTitleClass = 'text-base font-bold text-gray-900';

function InstitutionalPage({
  eyebrow,
  title,
  description,
  icon,
  children,
}: InstitutionalPageProps) {
  return (
    <CandidatePortalLayout maxWidth="wide">
      <section className="py-3 sm:py-6">
        <div className="mb-6 max-w-2xl">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary-100 bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700">
            {icon}
            {eyebrow}
          </div>
          <h1 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">{title}</h1>
          <p className="mt-3 text-base leading-7 text-gray-600">{description}</p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_280px] lg:gap-12">
          <div className="space-y-5">{children}</div>
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <Card padding="md">
              <p className="text-sm font-bold text-gray-900">Acesso rápido</p>
              <p className="mt-1 text-sm text-gray-500">
                Consulte vagas abertas ou acompanhe uma candidatura já enviada.
              </p>
              <div className="mt-4 flex flex-col gap-2.5">
                <Link to="/">
                  <Button fullWidth variant="outline" size="sm">
                    Ver vagas
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
                <Link to="/login">
                  <Button fullWidth size="sm">
                    Área do candidato
                  </Button>
                </Link>
              </div>
            </Card>
          </aside>
        </div>
      </section>
    </CandidatePortalLayout>
  );
}

export function AboutPage() {
  return (
    <InstitutionalPage
      eyebrow="Sobre nós"
      title="Recrutamento da Rede Marajó"
      description="O Marajó RH reúne as oportunidades abertas da Rede Marajó e organiza a comunicação com candidatos durante o processo seletivo."
      icon={<Building2 className="h-3.5 w-3.5" />}
    >
      <Card padding="lg">
        <div className="space-y-4">
          <h2 className={sectionTitleClass}>Atuação institucional</h2>
          <p className={paragraphClass}>
            Este portal foi criado para centralizar vagas públicas, envio de candidaturas,
            acompanhamento de etapas e solicitações ligadas ao processo seletivo.
          </p>
          <p className={paragraphClass}>
            As informações publicadas aqui devem refletir dados reais do processo de RH.
            Conteúdos institucionais adicionais serão ampliados conforme validação da equipe responsável.
          </p>
        </div>
      </Card>
    </InstitutionalPage>
  );
}

export function UnitsPage() {
  return (
    <InstitutionalPage
      eyebrow="Nossas unidades"
      title="Unidades"
      description="A listagem institucional das unidades ainda não foi disponibilizada para este portal."
      icon={<MapPin className="h-3.5 w-3.5" />}
    >
      <Card padding="lg">
        <div className="space-y-4">
          <h2 className={sectionTitleClass}>Conteúdo em preparação</h2>
          <p className={paragraphClass}>
            As unidades da Rede Marajó serão exibidas aqui quando houver uma fonte oficial
            validada para publicação. Até lá, as vagas abertas podem informar localidade
            diretamente no detalhe de cada oportunidade.
          </p>
        </div>
      </Card>
    </InstitutionalPage>
  );
}

export function FaqPage() {
  const items = [
    {
      question: 'Como envio minha candidatura?',
      answer:
        'Acesse a vaga desejada na listagem, clique em "Ver vaga" e em seguida no botão de candidatura. Preencha seus dados, envie o currículo em PDF e defina uma senha para acompanhar o processo. A candidatura é enviada e processada em tempo real.',
    },
    {
      question: 'Como acompanho minha candidatura?',
      answer:
        'Acesse a Área do candidato com o e-mail e senha que você criou ao se candidatar. Lá você vê o status atual, a etapa do processo e o resultado da análise de currículo quando disponível.',
    },
    {
      question: 'O que significa "análise em andamento"?',
      answer:
        'Quando há uma vaga vinculada à candidatura, o sistema solicita automaticamente a análise do currículo pela IA. O status evolui de "Análise na fila" para "Análise em andamento" e depois para "Análise concluída". A Área do candidato atualiza automaticamente enquanto o processo está em curso — você pode sair e voltar depois para ver o resultado.',
    },
    {
      question: 'Posso me candidatar novamente?',
      answer:
        'Sim, desde que o processo anterior esteja encerrado (aprovado, reprovado ou retirado). Se ainda houver uma candidatura ativa, o portal informará e oferecerá um link para acompanhar pela Área do candidato. Candidaturas em vagas diferentes são permitidas de forma sequencial.',
    },
    {
      question: 'Esqueci minha senha ou não consigo acessar.',
      answer:
        'Na tela de login, clique em "Primeiro acesso ou esqueci minha senha" e informe seu e-mail. Se houver um cadastro, você receberá as instruções para definir uma nova senha. A resposta é sempre genérica por segurança — verifique sua caixa de entrada e o spam.',
    },
  ];

  return (
    <InstitutionalPage
      eyebrow="Dúvidas frequentes"
      title="Perguntas sobre candidatura"
      description="Respostas iniciais para orientar o uso do portal sem substituir comunicações oficiais do RH."
      icon={<HelpCircle className="h-3.5 w-3.5" />}
    >
      <div className="space-y-3">
        {items.map((item) => (
          <Card key={item.question} padding="md">
            <h2 className={sectionTitleClass}>{item.question}</h2>
            <p className={`${paragraphClass} mt-2`}>{item.answer}</p>
          </Card>
        ))}
      </div>
    </InstitutionalPage>
  );
}

export function ContactPage() {
  return (
    <InstitutionalPage
      eyebrow="Contato"
      title="Contato institucional"
      description="Esta página deixa o espaço preparado para os canais oficiais de atendimento do RH."
      icon={<Mail className="h-3.5 w-3.5" />}
    >
      <Card padding="lg">
        <div className="space-y-4">
          <h2 className={sectionTitleClass}>Canais oficiais</h2>
          <p className={paragraphClass}>
            Nenhum telefone ou e-mail institucional foi confirmado no projeto para publicação
            nesta fase. Quando a equipe responsável validar o canal oficial, ele deve ser
            incluído aqui.
          </p>
          <p className={paragraphClass}>
            Para acompanhar uma candidatura já enviada, use a Área do candidato.
          </p>
        </div>
      </Card>
    </InstitutionalPage>
  );
}

export function PrivacyPage() {
  return (
    <InstitutionalPage
      eyebrow="Privacidade"
      title="Política de privacidade"
      description="Estrutura inicial para receber o conteúdo jurídico final sobre tratamento de dados pessoais."
      icon={<ShieldCheck className="h-3.5 w-3.5" />}
    >
      <Card padding="lg">
        <div className="space-y-4">
          <h2 className={sectionTitleClass}>Uso dos dados no processo seletivo</h2>
          <p className={paragraphClass}>
            Os dados informados no portal são usados para fins de recrutamento, seleção,
            acompanhamento de candidatura e etapas relacionadas ao processo de contratação.
          </p>
          <p className={paragraphClass}>
            O texto jurídico final deve ser revisado e publicado pela área responsável antes
            da homologação definitiva.
          </p>
        </div>
      </Card>
    </InstitutionalPage>
  );
}

export function TermsPage() {
  return (
    <InstitutionalPage
      eyebrow="Termos de uso"
      title="Termos de uso"
      description="Estrutura inicial para orientar as regras de uso do portal do candidato."
      icon={<FileText className="h-3.5 w-3.5" />}
    >
      <Card padding="lg">
        <div className="space-y-4">
          <h2 className={sectionTitleClass}>Uso responsável do portal</h2>
          <p className={paragraphClass}>
            O candidato deve informar dados verdadeiros, manter suas credenciais em segurança
            e enviar documentos próprios quando solicitado pelo processo seletivo.
          </p>
          <p className={paragraphClass}>
            Esta página ainda precisa receber o conteúdo jurídico final validado pela equipe
            responsável.
          </p>
        </div>
      </Card>
    </InstitutionalPage>
  );
}
