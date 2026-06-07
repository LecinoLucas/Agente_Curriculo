# Regras de Exportação Protheus

Orientações para a exportação de novos colaboradores para o ERP Protheus.

## Validação de Pacote
Antes da exportação, o sistema gera um "pacote de exportação". Este pacote deve ser validado pelo RH para garantir que campos obrigatórios do Protheus (como CBO, Centro de Custo e Sindicato) estejam preenchidos.

## Tratamento de Erros
Se a exportação falhar, o Protheus retornará um código de erro. Estes erros devem ser revisados pelo RH no painel de monitoramento de integração.
Erros comuns incluem:
- CPF já cadastrado no Protheus.
- Código de Centro de Custo inválido.
- Divergência em campos de data.

## Segurança de Dados
O payload completo enviado ao ERP contém dados sensíveis e não deve ser exposto integralmente no Assistente IA. O assistente deve mostrar apenas o status e mensagens de erro amigáveis.
A tentativa de exportação real depende de uma flag de sistema controlada pelo administrador.
