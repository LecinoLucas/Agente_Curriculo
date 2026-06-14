from __future__ import annotations

from collections import defaultdict

from src.application.services.job_ai_draft_rules import AiDraftSuggestedSkill
from src.application.services.skill_catalog_normalizer import normalize_skill_name
from src.infrastructure.database.models.skill_catalog_model import SkillCatalogModel


class JobAiSkillCatalogMatcher:
    def annotate(
        self,
        suggested_skills: list[AiDraftSuggestedSkill],
        catalog_skills: list[SkillCatalogModel],
    ) -> list[AiDraftSuggestedSkill]:
        skill_by_id = {str(skill.id): skill for skill in catalog_skills}
        matches_by_normalized: dict[str, set[str]] = defaultdict(set)

        for skill in catalog_skills:
            skill_id = str(skill.id)
            matches_by_normalized[skill.normalized_name].add(skill_id)
            for alias in skill.aliases:
                matches_by_normalized[alias.normalized_alias].add(skill_id)

        annotated: list[AiDraftSuggestedSkill] = []
        for item in suggested_skills:
            normalized_terms = [normalize_skill_name(item.name)]
            normalized_terms.extend(normalize_skill_name(alias) for alias in item.aliases)
            normalized_terms = [term for term in normalized_terms if term]

            matched_ids: set[str] = set()
            matched_by: list[str] = []
            for raw_term, normalized_term in [(item.name, normalize_skill_name(item.name)), *[(alias, normalize_skill_name(alias)) for alias in item.aliases]]:
                if not normalized_term:
                    continue
                if matches_by_normalized.get(normalized_term):
                    matched_ids.update(matches_by_normalized[normalized_term])
                    matched_by.append(raw_term)

            matched_skills = sorted(
                (skill_by_id[skill_id] for skill_id in matched_ids),
                key=lambda current: normalize_skill_name(current.name),
            )

            if not matched_skills:
                annotated.append(item)
                continue

            if len(matched_skills) == 1:
                matched_skill = matched_skills[0]
                annotated.append(
                    AiDraftSuggestedSkill(
                        name=item.name,
                        category=item.category or matched_skill.category or "other",
                        aliases=item.aliases,
                        description=item.description,
                        importance=item.importance,
                        source=item.source,
                        catalog_status="existing",
                        catalog_skill_id=str(matched_skill.id),
                        catalog_skill_name=matched_skill.name,
                        catalog_matched_by=list(dict.fromkeys(matched_by)),
                        catalog_conflicts=[],
                    )
                )
                continue

            annotated.append(
                AiDraftSuggestedSkill(
                    name=item.name,
                    category=item.category,
                    aliases=item.aliases,
                    description=item.description,
                    importance=item.importance,
                    source=item.source,
                    catalog_status="conflict",
                    catalog_skill_id=None,
                    catalog_skill_name=None,
                    catalog_matched_by=list(dict.fromkeys(matched_by)),
                    catalog_conflicts=[skill.name for skill in matched_skills],
                )
            )

        return annotated
