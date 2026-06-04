"""Seed de modelos de checklist admissional.

Cria 3 checklists padrão (CLT, Estágio, Jovem Aprendiz) se o banco ainda não
tiver nenhum template cadastrado. Idempotente: não executa caso já existam
registros em `pre_admission_checklist_templates`.

Uso:
    python scripts/seed_checklist_templates.py
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

from sqlalchemy import text

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.infrastructure.database.connection import AsyncSessionFactory, engine  # noqa: E402

CHECKLIST_TEMPLATES = [
    {
        "name": "CLT — Padrão",
        "description": "Documentos essenciais para contratação CLT formal",
        "admission_type": "CLT",
        "is_default": True,
        "items": [
            {"document_key": "rg", "title": "RG (Registro Geral)", "candidate_description": "Envie frente e verso do RG em imagem clara e sem cortes.", "is_required": True},
            {"document_key": "cpf", "title": "CPF", "candidate_description": "Foto ou digitalização do CPF.", "is_required": True},
            {"document_key": "ctps", "title": "Carteira de Trabalho (CTPS)", "candidate_description": "Envie as páginas de identificação e contratos anteriores.", "is_required": True},
            {"document_key": "foto_3x4", "title": "Foto 3×4 recente", "candidate_description": "Foto recente em fundo branco, tamanho 3×4.", "is_required": True},
            {"document_key": "titulo_eleitor", "title": "Título de Eleitor", "candidate_description": "Frente e verso do título de eleitor.", "is_required": True},
            {"document_key": "certidao_estado_civil", "title": "Certidão de nascimento ou casamento", "candidate_description": "Certidão de nascimento (solteiro) ou certidão de casamento.", "is_required": True},
            {"document_key": "comprovante_residencia", "title": "Comprovante de residência", "candidate_description": "Conta de água, luz ou gás dos últimos 90 dias.", "is_required": True},
            {"document_key": "pis_pasep", "title": "PIS / NIS / PASEP", "candidate_description": "Número do PIS, NIS ou PASEP.", "is_required": True},
            {"document_key": "dados_bancarios", "title": "Dados bancários", "candidate_description": "Banco, agência e conta corrente para depósito do salário.", "is_required": True},
            {"document_key": "escolaridade", "title": "Certificado de escolaridade", "candidate_description": "Diploma ou certificado do maior nível de escolaridade concluído.", "is_required": False},
            {"document_key": "aso", "title": "Atestado de Saúde Ocupacional (ASO)", "candidate_description": "ASO admissional emitido pelo médico do trabalho.", "is_required": True},
        ],
    },
    {
        "name": "Estágio",
        "description": "Documentos para formalização de contrato de estágio supervisionado",
        "admission_type": "Estágio",
        "is_default": False,
        "items": [
            {"document_key": "rg", "title": "RG (Registro Geral)", "candidate_description": "Frente e verso do RG.", "is_required": True},
            {"document_key": "cpf", "title": "CPF", "candidate_description": "Foto ou digitalização do CPF.", "is_required": True},
            {"document_key": "comprovante_matricula", "title": "Comprovante de matrícula", "candidate_description": "Comprovante emitido pela instituição de ensino (máx. 90 dias).", "is_required": True},
            {"document_key": "foto_3x4", "title": "Foto 3×4 recente", "candidate_description": "Foto recente em fundo branco.", "is_required": True},
            {"document_key": "certidao_estado_civil", "title": "Certidão de nascimento ou casamento", "candidate_description": "Certidão de nascimento (solteiro) ou certidão de casamento.", "is_required": True},
            {"document_key": "comprovante_residencia", "title": "Comprovante de residência", "candidate_description": "Conta de água, luz ou gás dos últimos 90 dias.", "is_required": True},
            {"document_key": "dados_bancarios", "title": "Dados bancários", "candidate_description": "Banco, agência e conta corrente para crédito da bolsa-auxílio.", "is_required": True},
            {"document_key": "aso", "title": "Atestado de Saúde Ocupacional (ASO)", "candidate_description": "ASO admissional emitido pelo médico do trabalho.", "is_required": True},
        ],
    },
    {
        "name": "Jovem Aprendiz",
        "description": "Documentos para contratação de menor aprendiz (Lei 10.097/2000)",
        "admission_type": "Aprendiz",
        "is_default": False,
        "items": [
            {"document_key": "rg", "title": "RG (Registro Geral)", "candidate_description": "Frente e verso do RG.", "is_required": True},
            {"document_key": "cpf", "title": "CPF", "candidate_description": "Foto ou digitalização do CPF.", "is_required": True},
            {"document_key": "certidao_nascimento", "title": "Certidão de nascimento", "candidate_description": "Certidão de nascimento (original ou cópia autenticada).", "is_required": True},
            {"document_key": "comprovante_matricula", "title": "Comprovante de matrícula", "candidate_description": "Comprovante de matrícula em escola ou curso profissionalizante.", "is_required": True},
            {"document_key": "foto_3x4", "title": "Foto 3×4 recente", "candidate_description": "Foto recente em fundo branco.", "is_required": True},
            {"document_key": "comprovante_residencia", "title": "Comprovante de residência", "candidate_description": "Conta de água, luz ou gás dos últimos 90 dias.", "is_required": True},
            {"document_key": "dados_bancarios", "title": "Dados bancários", "candidate_description": "Banco, agência e conta corrente para crédito.", "is_required": True},
            {"document_key": "autorizacao_responsavel", "title": "Autorização do responsável legal", "candidate_description": "Declaração assinada pelo responsável (obrigatório para menores de 18 anos).", "is_required": True},
            {"document_key": "aso", "title": "Atestado de Saúde Ocupacional (ASO)", "candidate_description": "ASO admissional emitido pelo médico do trabalho.", "is_required": True},
        ],
    },
]

_INSERT_TEMPLATE = text(
    """
    INSERT INTO pre_admission_checklist_templates
        (name, description, admission_type, is_active, is_default, created_at, updated_at)
    VALUES
        (:name, :description, :admission_type, TRUE, :is_default, NOW(), NOW())
    RETURNING id
    """
)

_INSERT_ITEM = text(
    """
    INSERT INTO pre_admission_checklist_template_items
        (template_id, document_key, title, candidate_description,
         is_required, accepted_file_types, max_file_size_mb,
         display_order, is_active, created_at, updated_at)
    VALUES
        (:template_id, :document_key, :title, :candidate_description,
         :is_required, ARRAY['application/pdf','image/jpeg','image/png']::text[], 10,
         :display_order, TRUE, NOW(), NOW())
    """
)


async def main() -> None:
    async with AsyncSessionFactory() as session:
        existing = await session.scalar(
            text("SELECT count(*) FROM pre_admission_checklist_templates")
        )
        if int(existing or 0) > 0:
            print(
                f"Pulando seed: já existem {existing} template(s) de checklist no banco."
            )
            await engine.dispose()
            return

        print("Inserindo modelos de checklist admissional...")

        for template in CHECKLIST_TEMPLATES:
            row = await session.execute(
                _INSERT_TEMPLATE,
                {
                    "name": template["name"],
                    "description": template["description"],
                    "admission_type": template["admission_type"],
                    "is_default": template["is_default"],
                },
            )
            template_id = row.scalar_one()

            for order, item in enumerate(template["items"]):  # type: ignore[union-attr]
                await session.execute(
                    _INSERT_ITEM,
                    {
                        "template_id": template_id,
                        "document_key": item["document_key"],
                        "title": item["title"],
                        "candidate_description": item["candidate_description"],
                        "is_required": item["is_required"],
                        "display_order": order,
                    },
                )

            item_count = len(template["items"])  # type: ignore[arg-type]
            default_label = " [padrão]" if template["is_default"] else ""
            print(f"  ✓ {template['name']}{default_label} — {item_count} documentos")

        await session.commit()

    await engine.dispose()
    print(
        f"Seed concluído: {len(CHECKLIST_TEMPLATES)} checklists admissionais inseridos."
    )


if __name__ == "__main__":
    asyncio.run(main())
