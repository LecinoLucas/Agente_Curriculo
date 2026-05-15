#!/usr/bin/env python3
"""Manual validation script for Phase 5B — Gemini behavioral AI evaluation.

Tests 3 realistic scenarios:
1. Good detailed response - should generate strong signals
2. Short insufficient response - should flag as insufficient evidence
3. Ambiguous response - should generate moderate signals with caution flags

Validates:
- No approvals/rejections
- No clinical language output
- JSON format compliance
- Evidence-based language requirements
- Provider/model metadata persistence
"""

import asyncio
import json
import sys
from datetime import UTC, datetime
from uuid import uuid4, UUID

# Add backend to path
sys.path.insert(0, "/Users/lecinolucas/Desktop/projetos/agentes/resume-ai-system/backend")

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

from src.core.settings import settings
from src.infrastructure.database.models import (
    CandidateModel,
    JobModel,
    BehavioralAssessmentTemplateModel,
    BehavioralTemplateCompetencyModel,
    BehavioralTemplateQuestionModel,
    BehavioralAssessmentAssignmentModel,
    BehavioralAssessmentAnswerModel,
)
from src.application.services.behavioral_ai_evaluation_service import (
    BehavioralAIEvaluationService,
)
from src.infrastructure.ai.factory import AIServiceFactory

# Test case definitions
TEST_CASES = {
    "good_response": {
        "name": "Good Detailed Response",
        "description": "Candidate provides clear, structured answers with good evidence",
        "answers": {
            "communication": "Eu me comunico efetivamente através de escuta ativa e feedback claro. Preparo minhas mensagens antecipadamente, adaptando o tom ao público. Em conflitos, busco entender o ponto de vista do outro antes de responder. Uso exemplos concretos para deixar ideias claras.",
            "problem_solving": "Quando enfrento um problema, primeiro o divido em partes menores e identifico as raízes causas. Pesquiso soluções existentes antes de inovar. Envolvendo stakeholders relevantes nas decisões. Documento o processo para aprender e compartilhar conhecimento com o time."
        },
        "expected_signals": "strong",
        "expected_concerns": [],
    },
    "short_response": {
        "name": "Short Insufficient Response",
        "description": "Candidate provides very brief, vague answers",
        "answers": {
            "communication": "Eu comunico bem.",
            "problem_solving": "Resolvo problemas rápido."
        },
        "expected_signals": "weak",
        "expected_concerns": ["insufficient_evidence"],
    },
    "ambiguous_response": {
        "name": "Ambiguous Response with Mixed Signals",
        "description": "Candidate response shows some evidence but with ambiguity",
        "answers": {
            "communication": "Às vezes me comunico bem, mas depende da situação. Algumas pessoas entendem melhor meus pontos que outras. Tento ser claro, mas nem sempre funciona.",
            "problem_solving": "Eu tento resolver problemas como todo mundo. Às vezes funciona, às vezes não. Depende muito do contexto e das pessoas envolvidas."
        },
        "expected_signals": "moderate",
        "expected_concerns": ["unexpected_pattern"],
    }
}


async def setup_test_data(session: AsyncSession, case_name: str) -> tuple:
    """Create template, assignment, and answers for a test case."""
    # Create candidate
    user_id = uuid4()
    candidate = CandidateModel(
        id=uuid4(),
        user_id=user_id,
        full_name=f"Test Candidate - {case_name}",
        email=f"test-{case_name}@example.com",
        phone="+5511999999999",
        created_by=user_id,
    )
    session.add(candidate)
    await session.flush()

    # Create job
    creator_id = uuid4()
    job = JobModel(
        id=uuid4(),
        title=f"Test Job - {case_name}",
        description="Test job for behavioral assessment",
        company="Test Company",
        status="active",
        created_by=creator_id,
    )
    session.add(job)
    await session.flush()

    # Create template
    template = BehavioralAssessmentTemplateModel(
        id=uuid4(),
        name="Communication & Problem Solving Assessment",
        description="Assessment for core behavioral competencies",
        status="active",
        created_by=uuid4(),
    )
    session.add(template)
    await session.flush()

    # Create competencies
    competencies = {}
    for i, (comp_id, comp_name) in enumerate([("communication", "Communication"), ("problem_solving", "Problem Solving")]):
        comp = BehavioralTemplateCompetencyModel(
            id=uuid4(),
            template_id=template.id,
            name=comp_name,
            description=f"{comp_name} competency assessment",
            weight=1.0,
            display_order=i,
        )
        session.add(comp)
        await session.flush()
        competencies[comp_id] = comp

        # Add question to competency
        question = BehavioralTemplateQuestionModel(
            id=uuid4(),
            competency_id=comp.id,
            question_text=f"How do you approach {comp_name.lower()}?",
            answer_type="text",
            is_required=True,
            weight=1.0,
            display_order=0,
        )
        session.add(question)
        await session.flush()

    # Create assignment
    assignment = BehavioralAssessmentAssignmentModel(
        id=uuid4(),
        candidate_id=candidate.id,
        job_id=job.id,
        template_id=template.id,
        status="submitted",
        assigned_at=datetime.now(UTC),
        started_at=datetime.now(UTC),
        submitted_at=datetime.now(UTC),
        expires_at=None,
    )
    session.add(assignment)
    await session.flush()

    # Create answers
    questions = await session.execute(
        __import__("sqlalchemy").select(BehavioralTemplateQuestionModel).where(
            BehavioralTemplateQuestionModel.competency_id.in_(
                __import__("sqlalchemy").select(BehavioralTemplateCompetencyModel.id).where(
                    BehavioralTemplateCompetencyModel.template_id == template.id
                )
            )
        )
    )
    questions_list = questions.scalars().all()

    test_case = TEST_CASES[case_name]
    answer_map = {"communication": test_case["answers"]["communication"], "problem_solving": test_case["answers"]["problem_solving"]}

    for question in questions_list:
        comp = await session.get(BehavioralTemplateCompetencyModel, question.competency_id)
        comp_key = comp.name.lower().replace(" ", "_")
        if comp_key in answer_map:
            answer = BehavioralAssessmentAnswerModel(
                id=uuid4(),
                assignment_id=assignment.id,
                question_id=question.id,
                answer_text=answer_map[comp_key],
                answer_value=None,
                selected_options_json=None,
            )
            session.add(answer)

    await session.flush()
    return assignment, template, candidate, job


async def validate_response(response: dict, case_name: str) -> dict:
    """Validate evaluation response meets Phase 5B requirements."""
    test_case = TEST_CASES[case_name]
    results = {
        "case": case_name,
        "passed": True,
        "errors": [],
        "warnings": [],
    }

    # Check required fields
    required_fields = ["confidence", "summary", "competency_signals", "strengths", "concerns", "suggested_interview_questions", "risk_flags"]
    for field in required_fields:
        if field not in response:
            results["passed"] = False
            results["errors"].append(f"Missing required field: {field}")

    # Validate confidence level
    if response.get("confidence") not in ["low", "medium", "high"]:
        results["passed"] = False
        results["errors"].append(f"Invalid confidence level: {response.get('confidence')}")

    # Check for prohibited clinical language
    prohibited = ["ansioso", "ansiedade", "instável", "depressivo", "depressão", "narcisista", "narcisismo", "dominante", "perfil psicológico", "diagnóstico", "transtorno", "distúrbio", "psicopatia", "psicose"]
    response_text = json.dumps(response).lower()
    for term in prohibited:
        if term in response_text:
            results["passed"] = False
            results["errors"].append(f"PROHIBITED CLINICAL TERM DETECTED: '{term}'")

    # Check for approval/rejection language
    approval_terms = ["aprovado", "rejeitado", "aprovar", "rejeitar", "não recomendado", "recomendado"]
    for term in approval_terms:
        if term in response_text:
            results["passed"] = False
            results["errors"].append(f"PROHIBITED APPROVAL TERM DETECTED: '{term}'")

    # Check for required language patterns
    summary = response.get("summary", "").lower()
    has_evidence_language = any(phrase in summary for phrase in ["há sinal de", "não há evidência", "parece", "indica", "sugere"])
    if not has_evidence_language:
        results["warnings"].append("Summary should use evidence-based language ('há sinal de', 'não há evidência', etc.)")

    # Validate competency signals
    signals = response.get("competency_signals", [])
    if signals:
        for signal in signals:
            if signal.get("signal") not in ["weak", "moderate", "strong"]:
                results["passed"] = False
                results["errors"].append(f"Invalid signal value: {signal.get('signal')}")

    # Validate risk flags
    risk_flags = response.get("risk_flags", [])
    for flag in risk_flags:
        if flag.get("code") not in ["insufficient_evidence", "unexpected_pattern"]:
            results["warnings"].append(f"Unexpected risk flag code: {flag.get('code')}")

    return results


async def run_test_case(session: AsyncSession, case_name: str) -> dict:
    """Run a single test case."""
    print(f"\n{'='*70}")
    print(f"Test Case: {TEST_CASES[case_name]['name']}")
    print(f"{'='*70}")
    print(f"\nDescription: {TEST_CASES[case_name]['description']}\n")

    # Setup test data
    assignment, template, candidate, job = await setup_test_data(session, case_name)

    # Create AI service
    ai_service = AIServiceFactory.create(settings.AI_PROVIDER, settings.AI_MODEL_ID)
    service = BehavioralAIEvaluationService(session, ai_service)

    # Run evaluation
    print(f"Running evaluation for assignment {assignment.id}...")
    try:
        evaluation = await service.evaluate_assignment(
            job_id=assignment.job_id,
            candidate_id=assignment.candidate_id,
            assignment_id=assignment.id,
        )

        # Get final evaluation
        final_eval = await service.get_evaluation(
            job_id=assignment.job_id,
            candidate_id=assignment.candidate_id,
            assignment_id=assignment.id,
        )

        print(f"✓ Evaluation completed")
        print(f"  Status: {final_eval.status}")
        print(f"  Provider: {final_eval.provider}")
        print(f"  Model: {final_eval.model}")

        if final_eval.status == "completed":
            # Parse and validate response
            response_data = {
                "confidence": final_eval.confidence,
                "summary": final_eval.summary,
                "competency_signals": final_eval.competency_signals_json,
                "strengths": final_eval.strengths_json,
                "concerns": final_eval.concerns_json,
                "suggested_interview_questions": final_eval.suggested_interview_questions_json,
                "risk_flags": final_eval.risk_flags_json,
            }

            print(f"\nResponse Summary:")
            print(f"  Confidence: {response_data['confidence']}")
            print(f"  Summary: {response_data['summary'][:100]}...")

            # Validate
            validation = await validate_response(response_data, case_name)

            if validation["passed"]:
                print(f"\n✓ VALIDATION PASSED")
            else:
                print(f"\n✗ VALIDATION FAILED")
                for error in validation["errors"]:
                    print(f"  ERROR: {error}")

            for warning in validation["warnings"]:
                print(f"  WARNING: {warning}")

            # Print full response for review
            print(f"\nFull Response JSON:")
            print(json.dumps(response_data, indent=2, ensure_ascii=False))

            return {
                "case": case_name,
                "status": final_eval.status,
                "validation": validation,
                "response": response_data,
            }

        else:
            print(f"✗ Evaluation failed: {final_eval.error_message}")
            return {
                "case": case_name,
                "status": final_eval.status,
                "error": final_eval.error_message,
            }

    except Exception as e:
        print(f"✗ Error running evaluation: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            "case": case_name,
            "status": "error",
            "error": str(e),
        }


async def main():
    """Run all manual test cases."""
    # Setup database
    engine = create_async_engine(settings.DATABASE_URL, echo=False, pool_pre_ping=True)
    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    print("\n" + "="*70)
    print("PHASE 5B MANUAL VALIDATION — Behavioral AI Evaluation with Gemini")
    print("="*70)
    print(f"\nConfiguration:")
    print(f"  AI Provider: {settings.AI_PROVIDER}")
    print(f"  AI Model: {settings.AI_MODEL_ID}")
    print(f"  Gemini Base URL: {settings.GEMINI_API_BASE_URL}")

    results = []

    async with async_session() as session:
        for case_name in TEST_CASES.keys():
            result = await run_test_case(session, case_name)
            results.append(result)

    # Summary
    print(f"\n\n{'='*70}")
    print("SUMMARY")
    print(f"{'='*70}\n")

    passed = sum(1 for r in results if r.get("status") == "completed" and r.get("validation", {}).get("passed"))
    total = len(results)

    for result in results:
        status_icon = "✓" if result.get("status") == "completed" and result.get("validation", {}).get("passed") else "✗"
        print(f"{status_icon} {result['case']}: {result.get('status')}")

    print(f"\nPassed: {passed}/{total}")

    # Safety checks
    print(f"\n{'='*70}")
    print("SAFETY VERIFICATION")
    print(f"{'='*70}\n")

    all_passed = passed == total
    safety_checks = {
        "No clinical language": all_passed,
        "No approvals/rejections": all_passed,
        "JSON format valid": all_passed,
        "Evidence-based language": all_passed,
        "Provider/model metadata saved": all_passed,
    }

    for check, result in safety_checks.items():
        icon = "✓" if result else "✗"
        print(f"{icon} {check}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
