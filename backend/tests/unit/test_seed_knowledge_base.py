import pytest
from unittest.mock import AsyncMock, MagicMock, patch, mock_open
from pathlib import Path
from scripts.seed_knowledge_base import run_seed, validate_safe_content, SEED_DOCUMENTS

@pytest.mark.asyncio
async def test_validate_safe_content_blocks_cpf():
    assert validate_safe_content("O CPF dele é 123.456.789-00") is False
    assert validate_safe_content("Conteúdo seguro sem dados") is True

@pytest.mark.asyncio
async def test_validate_safe_content_blocks_email():
    assert validate_safe_content("Contato: teste@empresa.com") is False

@pytest.mark.asyncio
async def test_validate_safe_content_blocks_sensitive_keywords():
    assert validate_safe_content("Aqui está a api_key secreta") is False
    assert validate_safe_content("Expondo o vector_json") is False

@pytest.mark.asyncio
@patch("scripts.seed_knowledge_base.AsyncSessionFactory")
@patch("scripts.seed_knowledge_base.TextIngestionService")
@patch("scripts.seed_knowledge_base.open", new_callable=mock_open, read_data="# Test Content")
@patch("scripts.seed_knowledge_base.Path.exists", return_value=True)
async def test_run_seed_dry_run_does_not_call_ingest(mock_exists, mock_file, mock_service_class, mock_session_factory):
    # Setup
    mock_service = mock_service_class.return_value
    mock_service.ingest = AsyncMock()
    
    # Run
    await run_seed(dry_run=True)
    
    # Verify
    assert mock_service.ingest.call_count == 0
    # Should print dry-run messages but not write to DB

@pytest.mark.asyncio
@patch("scripts.seed_knowledge_base.AsyncSessionFactory")
@patch("scripts.seed_knowledge_base.TextIngestionService")
@patch("scripts.seed_knowledge_base.open", new_callable=mock_open, read_data="# Test Content")
@patch("scripts.seed_knowledge_base.Path.exists", return_value=True)
async def test_run_seed_calls_ingest_for_each_doc(mock_exists, mock_file, mock_service_class, mock_session_factory):
    # Setup
    mock_service = mock_service_class.return_value
    mock_service.ingest = AsyncMock(return_value=MagicMock(ok=True, was_duplicate=False, chunks_created=5))
    
    # Run
    await run_seed(dry_run=False)
    
    # Verify
    assert mock_service.ingest.call_count == len(SEED_DOCUMENTS)
    
@pytest.mark.asyncio
@patch("scripts.seed_knowledge_base.AsyncSessionFactory")
@patch("scripts.seed_knowledge_base.TextIngestionService")
@patch("scripts.seed_knowledge_base.open", new_callable=mock_open, read_data="# Test Content com CPF 123.456.789-00")
@patch("scripts.seed_knowledge_base.Path.exists", return_value=True)
async def test_run_seed_skips_sensitive_doc(mock_exists, mock_file, mock_service_class, mock_session_factory):
    # Setup
    mock_service = mock_service_class.return_value
    mock_service.ingest = AsyncMock()
    
    # Run
    await run_seed(dry_run=False)
    
    # Verify
    assert mock_service.ingest.call_count == 0

@pytest.mark.asyncio
@patch("scripts.seed_knowledge_base.AsyncSessionFactory")
@patch("scripts.seed_knowledge_base.TextIngestionService")
@patch("scripts.seed_knowledge_base.open", new_callable=mock_open, read_data="# Test Content")
@patch("scripts.seed_knowledge_base.Path.exists", return_value=True)
async def test_run_seed_handles_duplicates(mock_exists, mock_file, mock_service_class, mock_session_factory):
    # Setup
    mock_service = mock_service_class.return_value
    mock_service.ingest = AsyncMock(return_value=MagicMock(ok=True, was_duplicate=True, content_hash="abc"))
    
    # Run
    await run_seed(dry_run=False)
    
    # Verify
    assert mock_service.ingest.call_count == len(SEED_DOCUMENTS)
