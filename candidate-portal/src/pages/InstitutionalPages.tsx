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

        <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
          <div className="space-y-5">{children}</div>
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <Card padding="md">
              <p className="text-sm font-bold text-gray-900">Acesso rápido</p>
              <p className="mt-1 text-sm text-gray-500">
                Consulte vagas abertas ou acompanhe uma candidatura já enviada.
              </p>
              <div className="mt-4 space-y-2">
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
      question: 'Como envio uma candidatura?',
      answer:
        'Acesse a vaga desejada, revise as informações e use o botão de candidatura. O formulário envia os dados e o currículo para a API pública do portal.',
    },
    {
      question: 'Como acompanho meu processo?',
      answer:
        'Depois de enviar uma candidatura com senha, entre pela Área do candidato para consultar o andamento disponível para o seu perfil.',
    },
    {
      question: 'Posso me candidatar novamente?',
      answer:
        'A regra de novas candidaturas depende do estado do seu processo atual. Quando houver restrição, o backend retorna a mensagem correspondente no envio.',
    },
    {
      question: 'O que faço se não conseguir entrar?',
      answer:
        'Verifique se o e-mail e a senha estão corretos. Se o problema continuar, aguarde o canal institucional de contato ser confirmado pela equipe de RH.',
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
