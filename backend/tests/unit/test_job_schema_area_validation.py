from src.interface.api.schemas.job_schemas import CreateJobRequest, UpdateJobRequest


def test_create_job_request_accepts_registered_area_name() -> None:
    payload = CreateJobRequest(
        title="Analista de Operações",
        description="Descricao suficientemente longa para passar na validacao.",
        job_area="Tecnologia",
    )

    assert payload.job_area == "Tecnologia"


def test_update_job_request_preserves_custom_registered_area_name() -> None:
    payload = UpdateJobRequest(
        title="Analista de Operações",
        description="Descricao suficientemente longa para passar na validacao.",
        job_area="Tecnologiass",
    )

    assert payload.job_area == "Tecnologiass"
