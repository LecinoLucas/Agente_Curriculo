"""
✅ DIAGNÓSTICO E2E: Validar Pipeline Real com Dados Existentes

Executa diagnóstico completo do pipeline real:
- Coleta dados de análises existentes
- Valida extraction, matching, scoring
- Classifica erros encontrados
- Sem fazer correções, apenas diagnosticando
"""

import asyncio
import json
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
import sqlalchemy as sa

DATABASE_URL = "postgresql+asyncpg://LecinoLucas:020219@localhost:5432/resume_ai"


async def diagnose_e2e_pipeline():
    """Diagnóstico completo do pipeline."""

    print("\n" + "="*100)
    print("🔬 DIAGNÓSTICO E2E: PIPELINE REAL")
    print("="*100)

    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with async_session() as session:
            # ── Get most recent completed analysis ──────────────────────
            print("\n📊 STEP 1: Colecionar Análise Completada Recente")
            print("-" * 100)

            result = await session.execute(
                sa.text("""
                SELECT
                    a.id as analysis_id,
                    a.status,
                    a.created_at,
                    a.job_id,
                    ar.overall_score,
                    ar.seniority_level,
                    ar.total_experience_years,
                    ar.extracted_data,
                    ar.strengths,
                    ar.weaknesses,
                    ar.keywords,
                    ar.prompt_version_used,
                    ar.raw_llm_response
                FROM analyses a
                LEFT JOIN analysis_results ar ON a.id = ar.analysis_id
                WHERE a.status = 'completed'
                ORDER BY a.created_at DESC
                LIMIT 1
                """)
            )
            analysis_row = result.fetchone()

            if not analysis_row:
                print("❌ Nenhuma análise completada encontrada no banco")
                return

            (
                analysis_id, status, created_at, job_id, overall_score,
                seniority, years_exp, extracted_data_str, strengths,
                weaknesses, keywords, prompt_used, raw_response
            ) = analysis_row

            print(f"✓ Analysis ID: {analysis_id}")
            print(f"✓ Status: {status}")
            print(f"✓ Created: {created_at}")
            print(f"✓ Overall Score: {overall_score}")
            print(f"✓ Prompt Used: {prompt_used}")

            # extracted_data might be dict or JSON string
            if isinstance(extracted_data_str, dict):
                extracted_data = extracted_data_str
            elif isinstance(extracted_data_str, str):
                extracted_data = json.loads(extracted_data_str) if extracted_data_str else {}
            else:
                extracted_data = {}

            # ── STEP 2: Validate Extraction ────────────────────────────
            print("\n🔍 STEP 2: Validação da EXTRAÇÃO")
            print("-" * 100)

            cand_understanding = extracted_data.get("candidate_understanding", {})
            detected_level = cand_understanding.get("detected_level")
            estimated_years = cand_understanding.get("estimated_experience_years")
            evidenced_skills = cand_understanding.get("evidenced_skills", [])
            relevant_exp = cand_understanding.get("most_relevant_experiences", [])
            equiv_matches = cand_understanding.get("equivalent_matches", [])

            print(f"\n✓ Detected Seniority Level: {detected_level}")
            print(f"✓ Estimated Years Experience: {estimated_years} years")
            print(f"✓ Evidenced Skills: {len(evidenced_skills)} found")
            for i, skill in enumerate(evidenced_skills[:5], 1):
                print(f"    {i}. {skill}")
            if len(evidenced_skills) > 5:
                print(f"    ... and {len(evidenced_skills) - 5} more")

            print(f"\n✓ Most Relevant Experiences: {len(relevant_exp)} found")
            for i, exp in enumerate(relevant_exp[:3], 1):
                print(f"    {i}. {exp}")

            print(f"\n✓ Equivalent Matches: {len(equiv_matches)}")
            for match in equiv_matches[:3]:
                req = match.get("job_requirement")
                evidence = match.get("candidate_evidence")
                conf = match.get("confidence")
                print(f"    - {req}")
                print(f"      Evidence: {evidence[:70]}...")
                print(f"      Confidence: {conf}")

            # ── STEP 3: Validate Matching (if job exists) ──────────────
            print("\n🎯 STEP 3: Validação do MATCHING")
            print("-" * 100)

            if job_id:
                result = await session.execute(
                    sa.text("""
                    SELECT
                        match_score,
                        skills_match_score,
                        experience_match_score,
                        seniority_match_score,
                        matched_skills,
                        missing_skills,
                        bonus_skills,
                        recommendation,
                        validation_status,
                        missing_evidence,
                        rejection_reasons
                    FROM resume_job_matches
                    WHERE analysis_id = :analysis_id
                    LIMIT 1
                    """),
                    {"analysis_id": analysis_id},
                )
                match_row = result.fetchone()

                if match_row:
                    (
                        m_score, skills_score, exp_score, sen_score,
                        matched, missing, bonus, rec, valid_status,
                        missing_ev, rejection
                    ) = match_row

                    # Handle both dict and JSON string formats
                    matched_list = matched if isinstance(matched, list) else (json.loads(matched) if matched else [])
                    missing_list = missing if isinstance(missing, list) else (json.loads(missing) if missing else [])
                    bonus_list = bonus if isinstance(bonus, list) else (json.loads(bonus) if bonus else [])
                    missing_ev_list = missing_ev if isinstance(missing_ev, list) else (json.loads(missing_ev) if missing_ev else [])
                    rejection_list = rejection if isinstance(rejection, list) else (json.loads(rejection) if rejection else [])

                    print(f"\n✓ Match Score: {m_score}")
                    print(f"  └─ Skills Score: {skills_score}")
                    print(f"  └─ Experience Score: {exp_score}")
                    print(f"  └─ Seniority Score: {sen_score}")

                    print(f"\n✓ Skills Matching:")
                    print(f"  Matched: {len(matched_list)} - {', '.join(matched_list)}")
                    print(f"  Missing: {len(missing_list)} - {', '.join(missing_list)}")
                    print(f"  Bonus: {', '.join(bonus_list)}")

                    print(f"\n✓ Validation Status: {valid_status}")
                    if missing_ev_list:
                        print(f"  Missing Evidence: {', '.join(missing_ev_list)}")
                    if rejection_list:
                        print(f"  Rejection Reasons: {', '.join(rejection_list)}")

                    print(f"\n✓ Recommendation: {rec}")
                else:
                    print("ℹ No matching record for this analysis")
            else:
                print("ℹ Analysis not matched to any job")

            # ── STEP 4: Analyze Raw Response ──────────────────────────
            print("\n📝 STEP 4: Análise da RESPOSTA RAW")
            print("-" * 100)

            if raw_response:
                response_str = raw_response if isinstance(raw_response, str) else str(raw_response)
                if "dev_mock" in response_str.lower():
                    print("❌ Usando DEV_MOCK (scores synthetic)")
                elif "VERIFICATION" in response_str:
                    print("✅ Usando prompt REAL v2 (marcador encontrado)")
                    print(f"   Response preview: {response_str[:150]}...")
                else:
                    print("✓ Response received from IA")
                    print(f"   Preview: {response_str[:150]}...")

            # ── STEP 5: Detailed Analysis Assessment ─────────────────
            print("\n📋 STEP 5: Avaliação Detalhada")
            print("-" * 100)

            assessment = {
                "extraction": {
                    "status": "✓ OK" if estimated_years and detected_level else "⚠ INCOMPLETE",
                    "findings": [],
                    "priority": "low"
                },
                "matching": {
                    "status": "✓ OK" if job_id else "ℹ NOT MATCHED",
                    "findings": [],
                    "priority": "medium"
                },
                "scoring": {
                    "status": "✓ OK" if overall_score else "❌ ERROR",
                    "findings": [],
                    "priority": "high"
                }
            }

            # Extraction checks
            if not estimated_years:
                assessment["extraction"]["findings"].append(
                    "Missing estimated_experience_years"
                )
                assessment["extraction"]["status"] = "⚠ INCOMPLETE"

            if not detected_level:
                assessment["extraction"]["findings"].append(
                    "Missing detected_level (seniority not determined)"
                )
                assessment["extraction"]["status"] = "⚠ INCOMPLETE"

            if len(evidenced_skills) < 3:
                assessment["extraction"]["findings"].append(
                    f"Only {len(evidenced_skills)} skills extracted (expected 3+)"
                )

            # Matching checks
            if job_id and match_row:
                if len(missing_list) > 0:
                    assessment["matching"]["findings"].append(
                        f"Missing {len(missing_list)} mandatory skills: {', '.join(missing_list)}"
                    )

                if missing_ev_list:
                    assessment["matching"]["findings"].append(
                        f"Missing evidence for: {', '.join(missing_ev_list)}"
                    )

            # Scoring checks
            if overall_score:
                if overall_score < 40:
                    assessment["scoring"]["findings"].append(
                        f"Low overall score ({overall_score}) - validate data extraction"
                    )
                if overall_score > 95:
                    assessment["scoring"]["findings"].append(
                        f"High overall score ({overall_score}) - verify grading criteria"
                    )

            print("\n✓ EXTRACTION:")
            print(f"  Status: {assessment['extraction']['status']}")
            if assessment['extraction']['findings']:
                for finding in assessment['extraction']['findings']:
                    print(f"  - {finding}")

            print("\n✓ MATCHING:")
            print(f"  Status: {assessment['matching']['status']}")
            if assessment['matching']['findings']:
                for finding in assessment['matching']['findings']:
                    print(f"  - {finding}")

            print("\n✓ SCORING:")
            print(f"  Status: {assessment['scoring']['status']}")
            if assessment['scoring']['findings']:
                for finding in assessment['scoring']['findings']:
                    print(f"  - {finding}")

            # ── STEP 6: Summary ────────────────────────────────────────
            print("\n" + "="*100)
            print("📊 RESUMO DO DIAGNÓSTICO")
            print("="*100)

            print(f"""
Analysis ID: {analysis_id}
Status: {status}
Created: {created_at}

EXTRACTION RESULTS:
  ✓ Seniority Detected: {detected_level}
  ✓ Experience: {estimated_years} years
  ✓ Skills Identified: {len(evidenced_skills)}
  ✓ Relevant Experiences: {len(relevant_exp)}
  ✓ Equivalent Matches: {len(equiv_matches)}

MATCHING RESULTS:
  {'✓ Matched to job: YES' if job_id else '⚠ Matched to job: NO'}
  {f'✓ Match Score: {m_score}' if job_id and match_row else ''}
  {f'✓ Recommendation: {rec}' if job_id and match_row else ''}
  {f'✓ Validation: {valid_status}' if job_id and match_row else ''}

SCORING:
  ✓ Overall Score: {overall_score}
  ✓ Seniority Level: {seniority}
  ✓ Total Experience: {years_exp} years

PROMPT:
  ✓ Version Used: {prompt_used}
  {'✓ Using REAL PROMPT v2' if 'dev_mock' not in prompt_used.lower() else '❌ Using DEV_MOCK'}

ASSESSMENT:
  Extraction: {assessment['extraction']['status']}
  Matching: {assessment['matching']['status']}
  Scoring: {assessment['scoring']['status']}

NEXT STEPS:
  1. Check if extracted data aligns with resume content
  2. Validate skill normalization (Power BI, SQL, ETL, etc)
  3. Verify matching logic with job requirements
  4. Review scoring against established criteria
""")

            print("="*100)
            print("✅ DIAGNÓSTICO COMPLETO")
            print("="*100)

    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(diagnose_e2e_pipeline())
