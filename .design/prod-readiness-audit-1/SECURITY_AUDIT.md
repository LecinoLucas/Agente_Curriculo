# Auditoria de Segurança (Security Audit)

**Data:** 07/06/2026

## 1. Gestão de Segredos e Credenciais
- **APROVADO**: Nenhuma senha, token ou chave API sensível em texto claro encontrada no código de produção.
- **ALERTA MÉDIO**: Existe uma chave Fernet hardcoded em `backend/src/core/settings.py` L284-L286 para o ambiente de dev/test. O sistema previne seu uso em produção lançando `ValueError` se `FIELD_ENCRYPTION_KEY` estiver vazia, mas sua presença no código-fonte eleva o risco se a variável de ambiente for mal configurada.
- **ALERTA MÉDIO**: Alguns arquivos inúteis foram comitados (ex. `dump.rdb` e `backup_*.dump`), o que constitui vazamento de dados não estruturados de banco e cache no repositório.

## 2. CORS e Segurança de Camada de Rede
- **APROVADO**: CORS_ORIGINS explicitamente definidos, e uso de `allow_origins=settings.CORS_ORIGINS`. O projeto bloqueia regex de rede local em ambientes produtivos (sendo trocado para explícito `None`). Nenhum uso de `*` wildcard combinado com `allow_credentials=True`.

## 3. Uploads e Arquivos
- **RISCO CRÍTICO**: A rota `POST /api/v1/conversations/{session_id}/resume` em `conversation_upload.py` L79-91 permite upload anônimo desde que o usuário conheça ou descubra um UUID válido de sessão. Faltam verificações de identidade e rate limits rígidos contra força-bruta.
- **ALERTA MÉDIO**: O ClamAV para checagem anti-vírus de PDFs vem desativado por padrão (`FILE_SCAN_ENABLED: bool = False`). A lógica de checagem contra magics maliciosas existe no `upload_validation_service.py`, porém o scan binário está inativo.
- **APROVADO**: Defesa forte contra path traversal (`..` e bytestrings nulos).

## 4. Endpoints Admin e RBAC
- **APROVADO**: A segurança baseia-se em instâncias sólidas do `ToolPermissionGuard` e middlewares globais para as rotas e funções internas.
