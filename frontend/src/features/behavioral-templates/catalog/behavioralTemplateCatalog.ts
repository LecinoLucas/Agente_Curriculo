import administrativoAtendimento from "../../../data/behavioral-templates/administrativo-atendimento.json";
import operacionalPostos from "../../../data/behavioral-templates/operacional-postos.json";
import liderancaGestao from "../../../data/behavioral-templates/lideranca-gestao.json";
import tecnologiaSuporte from "../../../data/behavioral-templates/tecnologia-suporte.json";
import aprendizagemAdaptabilidade from "../../../data/behavioral-templates/aprendizagem-adaptabilidade.json";
import type { RawTemplate } from "../templateImporter";

/**
 * Catálogo estático de produto.
 * Não é mock, fixture ou fallback.
 * Usado como biblioteca de modelos prontos para criar drafts persistidos via API.
 * Nenhum item deste catálogo deve ser usado como substituto de resposta do backend.
 */
export const BUNDLED_TEMPLATES: RawTemplate[] = [
  administrativoAtendimento as RawTemplate,
  operacionalPostos as RawTemplate,
  liderancaGestao as RawTemplate,
  tecnologiaSuporte as RawTemplate,
  aprendizagemAdaptabilidade as RawTemplate,
];
