from dataclasses import dataclass


@dataclass
class ScoreResult:
    match_score: int
    score_breakdown: dict
    recommendation: str
    confidence: str
    gaps: list[str]
    strengths: list[str]


class DeterministicScorer:
    def calculate(self, job_profile: dict, candidate_profile: dict) -> ScoreResult:
        breakdown = {
            "technical_competencies": self._score_technical(job_profile, candidate_profile),
            "practical_experience": self._score_experience(job_profile, candidate_profile),
            "seniority": self._score_seniority(job_profile, candidate_profile),
            "role_fit": self._score_role_fit(job_profile, candidate_profile),
            "differentials": self._score_differentials(job_profile, candidate_profile),
        }
        total = sum(breakdown.values())
        return ScoreResult(
            match_score=min(total, 100),
            score_breakdown=breakdown,
            recommendation=self._recommendation(total),
            confidence=self._confidence(job_profile, candidate_profile),
            gaps=self._gaps(job_profile, candidate_profile),
            strengths=self._strengths(job_profile, candidate_profile),
        )

    def _score_technical(self, job: dict, candidate: dict) -> int:
        # max 40pts
        required = {s.get("name", "").lower() for s in job.get("critical_requirements", [])}
        evidenced = {s.get("name", "").lower() for s in candidate.get("evidenced_skills", [])}
        tools = {t.lower() for t in candidate.get("tools", [])}
        if not required:
            return 20
        matched = required & (evidenced | tools)
        return round((len(matched) / len(required)) * 40)

    def _score_experience(self, job: dict, candidate: dict) -> int:
        # max 25pts
        min_years = job.get("minimum_years_experience") or 0
        candidate_years = candidate.get("total_experience_years") or 0
        if min_years == 0:
            return 15
        ratio = min(candidate_years / min_years, 1.5)
        return round(min(ratio * 25, 25))

    def _score_seniority(self, job: dict, candidate: dict) -> int:
        # max 10pts
        order = ["intern", "junior", "mid", "senior", "lead"]
        target = job.get("target_level", "").lower()
        detected = candidate.get("seniority_level", "").lower()
        if target not in order or detected not in order:
            return 5
        diff = abs(order.index(target) - order.index(detected))
        return [10, 7, 4, 1, 0][min(diff, 4)]

    def _score_role_fit(self, job: dict, candidate: dict) -> int:
        # max 15pts
        job_area = job.get("area", "").lower()
        candidate_area = candidate.get("professional_area", "").lower()
        if not job_area or not candidate_area:
            return 8
        return 15 if job_area == candidate_area else 5

    def _score_differentials(self, job: dict, candidate: dict) -> int:
        # max 10pts
        desirable = {s.get("name", "").lower() for s in job.get("desirable_requirements", [])}
        evidenced = {s.get("name", "").lower() for s in candidate.get("evidenced_skills", [])}
        tools = {t.lower() for t in candidate.get("tools", [])}
        if not desirable:
            return 5
        matched = desirable & (evidenced | tools)
        return round((len(matched) / len(desirable)) * 10)

    def _recommendation(self, score: int) -> str:
        if score >= 82:
            return "strong_match"
        if score >= 65:
            return "interview"
        if score >= 45:
            return "maybe"
        return "reject"

    def _confidence(self, job: dict, candidate: dict) -> str:
        has_job = bool(job.get("critical_requirements"))
        has_candidate = bool(candidate.get("evidenced_skills"))
        if has_job and has_candidate:
            return "high"
        if has_job or has_candidate:
            return "medium"
        return "low"

    def _gaps(self, job: dict, candidate: dict) -> list[str]:
        required = {s.get("name", "") for s in job.get("critical_requirements", [])}
        evidenced = {s.get("name", "").lower() for s in candidate.get("evidenced_skills", [])}
        tools = {t.lower() for t in candidate.get("tools", [])}
        return [r for r in required if r.lower() not in (evidenced | tools)]

    def _strengths(self, job: dict, candidate: dict) -> list[str]:
        required = {s.get("name", "") for s in job.get("critical_requirements", [])}
        evidenced = {s.get("name", "") for s in candidate.get("evidenced_skills", [])}
        return [s for s in evidenced if s.lower() in {r.lower() for r in required}]
