#!/usr/bin/env bash

set -euo pipefail

ADMISSION_BACKEND_BASE_URL="${ADMISSION_BACKEND_BASE_URL:-http://127.0.0.1:8000}"
ADMISSION_CASE_ID_FOR_BRIDGE_CHECK="${ADMISSION_CASE_ID_FOR_BRIDGE_CHECK:-}"
ADMISSION_BRIDGE_CHECK_BEARER_TOKEN="${ADMISSION_BRIDGE_CHECK_BEARER_TOKEN:-}"
ADMISSION_BRIDGE_CHECK_COOKIE="${ADMISSION_BRIDGE_CHECK_COOKIE:-}"

if command -v mktemp >/dev/null 2>&1; then
  TMP_BODY="$(mktemp)"
else
  TMP_BODY="/tmp/admission-bridge-summary.$$"
fi
trap 'rm -f "$TMP_BODY"' EXIT

printf 'Verificando backend do Admissão RH em %s\n' "$ADMISSION_BACKEND_BASE_URL"

if ! curl -fsS "$ADMISSION_BACKEND_BASE_URL/health" >/dev/null; then
  printf 'Backend do Admissão RH indisponível em %s/health\n' "$ADMISSION_BACKEND_BASE_URL" >&2
  exit 1
fi

printf 'Backend online.\n'

if [ -z "$ADMISSION_CASE_ID_FOR_BRIDGE_CHECK" ]; then
  printf 'Nenhum case configurado para o resumo da bridge.\n'
  printf 'Defina ADMISSION_CASE_ID_FOR_BRIDGE_CHECK=<case_id> para validar o endpoint read-only.\n'
  exit 0
fi

SUMMARY_URL="$ADMISSION_BACKEND_BASE_URL/api/v1/pre-admission/cases/$ADMISSION_CASE_ID_FOR_BRIDGE_CHECK/protheus-bridge-summary"

CURL_ARGS=(
  -sS
  -o "$TMP_BODY"
  -w "%{http_code}"
)

if [ -n "$ADMISSION_BRIDGE_CHECK_BEARER_TOKEN" ]; then
  CURL_ARGS+=(-H "Authorization: Bearer $ADMISSION_BRIDGE_CHECK_BEARER_TOKEN")
fi

if [ -n "$ADMISSION_BRIDGE_CHECK_COOKIE" ]; then
  CURL_ARGS+=(-H "Cookie: $ADMISSION_BRIDGE_CHECK_COOKIE")
fi

HTTP_CODE="$(curl "${CURL_ARGS[@]}" "$SUMMARY_URL")"

case "$HTTP_CODE" in
  200)
    if ! grep -q '"status"' "$TMP_BODY"; then
      printf 'Resumo retornou 200, mas sem o campo status esperado.\n' >&2
      exit 1
    fi
    if grep -Eiq 'x-internal-api-key|authorization|dev-bridge-key-local|cpf|pis|ctps|payload_raw|stacktrace' "$TMP_BODY"; then
      printf 'Resumo contém conteúdo sensível inesperado.\n' >&2
      exit 1
    fi
    printf 'Resumo read-only respondeu 200.\n'
    printf 'Campos verificados:\n'
    grep -Eo '"status":"[^"]*"|"available":[^,}]*|"enabled":[^,}]*|"environment":"[^"]*"|"storage_mode":"[^"]*"' "$TMP_BODY" \
      | sed 's/^/  - /'
    ;;
  401|403)
    printf 'Endpoint respondeu %s.\n' "$HTTP_CODE"
    printf 'O backend está online e protegendo o resumo read-only com autenticação normal.\n'
    printf 'Para validar o payload 200, rode o check com sessão/cookie de staff ou use o browser autenticado.\n'
    ;;
  404)
    printf 'Case %s não encontrado para o resumo da bridge.\n' "$ADMISSION_CASE_ID_FOR_BRIDGE_CHECK" >&2
    exit 1
    ;;
  *)
    printf 'Resumo read-only falhou com HTTP %s.\n' "$HTTP_CODE" >&2
    if grep -q '"message"' "$TMP_BODY"; then
      grep -Eo '"message":"[^"]*"' "$TMP_BODY" | head -n 1 | sed 's/^/Resposta: /' >&2
    fi
    exit 1
    ;;
esac
