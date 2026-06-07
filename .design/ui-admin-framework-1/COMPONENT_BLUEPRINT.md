# Component Blueprint

Escopo: planejamento de componentes futuros. Sem implementação nesta fase.

## AdminListPage

### Responsabilidade

Ser o wrapper principal para páginas administrativas densas, organizando:

- header;
- métricas;
- toolbar;
- área principal de lista;
- painel lateral opcional.

### Props sugeridas

- `title`
- `eyebrow`
- `description`
- `primaryAction`
- `secondaryActions`
- `metrics`
- `filters`
- `children`
- `sideContent`

### Exemplo de uso

```tsx
<AdminListPage
  eyebrow="Admin / IA"
  title="Base de conhecimento"
  description="Gerencie documentos e indexação."
  primaryAction={<Button>Novo documento</Button>}
  secondaryActions={<Button variant="outline">Exportar</Button>}
  metrics={<AdminMetricStrip items={metrics} />}
  filters={<AdminToolbar ... />}
>
  <AdminEntityList ... />
</AdminListPage>
```

### O que NÃO deve fazer

- não buscar dados;
- não decidir regras de negócio;
- não abrir formulário sozinho;
- não assumir layout específico de uma página real.

## CompactPageHeader

### Responsabilidade

Oferecer topo compacto com:

- eyebrow;
- título;
- descrição;
- ações à direita.

### Props sugeridas

- `eyebrow`
- `title`
- `description`
- `actions`
- `className`

### Exemplo de uso

```tsx
<CompactPageHeader
  eyebrow="Pré-admissão"
  title="Checklists"
  description="Gerencie os modelos ativos."
  actions={<Button>Novo checklist</Button>}
/>
```

### O que NÃO deve fazer

- não renderizar hero grande;
- não embutir métricas;
- não definir toolbar;
- não impor CTA secundário.

## AdminMetricStrip

### Responsabilidade

Exibir métricas compactas e comparáveis em uma faixa curta.

### Props sugeridas

- `items`
- `className`

Cada item pode conter:

- `label`
- `value`
- `tone`
- `hint`

### Exemplo de uso

```tsx
<AdminMetricStrip
  items={[
    { label: "Total", value: 42 },
    { label: "Pendentes", value: 5, tone: "warning" },
    { label: "Erros", value: 1, tone: "danger" },
  ]}
/>
```

### O que NÃO deve fazer

- não virar grid de cards altos;
- não substituir visualização principal;
- não esconder métricas críticas dentro de tooltip.

## AdminToolbar

### Responsabilidade

Concentrar busca, filtro, ordenação e ações secundárias.

### Props sugeridas

- `search`
- `filters`
- `sort`
- `actions`
- `className`

### Exemplo de uso

```tsx
<AdminToolbar
  search={<Input placeholder="Buscar documento" />}
  filters={<Select defaultValue="all">...</Select>}
  sort={<Select defaultValue="recent">...</Select>}
  actions={<Button variant="outline">Atualizar</Button>}
/>
```

### O que NÃO deve fazer

- não virar header;
- não conter CTA primário principal da página;
- não abrir editor automaticamente.

## AdminEntityList ou EntityTable

### Responsabilidade

Ser a visualização principal de dados repetitivos.

### Props sugeridas

- `columns`
- `rows`
- `loading`
- `error`
- `emptyState`
- `renderRow`
- `onRowClick`

### Exemplo de uso

```tsx
<AdminEntityList
  columns={columns}
  rows={documents}
  loading={loading}
  emptyState={...}
  renderRow={(doc) => ...}
/>
```

### O que NÃO deve fazer

- não renderizar conteúdo longo aberto;
- não editar inline por padrão;
- não incorporar regras específicas de documentos, chunks ou checklists.

## AdminSidePanel

### Responsabilidade

Abrir detalhe, criação ou edição sob demanda mantendo a lista como contexto.

### Props sugeridas

- `open`
- `onClose`
- `title`
- `description`
- `children`
- `footer`
- `size`

### Exemplo de uso

```tsx
<AdminSidePanel
  open={open}
  onClose={close}
  title="Editar documento"
  description="Atualize os metadados e o conteúdo."
  footer={<Button>Salvar</Button>}
>
  <DocumentForm />
</AdminSidePanel>
```

### O que NÃO deve fazer

- não abrir sem ação do usuário;
- não ser usado como navegação principal;
- não decidir salvar ou carregar sozinho.

## CompactEmptyState

### Responsabilidade

Exibir vazio útil e compacto em contextos administrativos.

### Props sugeridas

- `title`
- `description`
- `primaryAction`
- `secondaryAction`
- `icon`

### Exemplo de uso

```tsx
<CompactEmptyState
  title="Nenhum documento encontrado"
  description="Crie o primeiro item para começar."
  primaryAction={<Button>Novo documento</Button>}
/>
```

### O que NÃO deve fazer

- não ocupar altura exagerada sem necessidade;
- não esconder a próxima ação;
- não usar linguagem vaga.

## RowActions

### Responsabilidade

Agrupar ações por linha de modo compacto e previsível.

### Props sugeridas

- `actions`
- `label`
- `direction`

Cada ação pode conter:

- `label`
- `onClick`
- `to`
- `tone`
- `disabled`

### Exemplo de uso

```tsx
<RowActions
  actions={[
    { label: "Ver detalhes", onClick: openView },
    { label: "Editar", onClick: openEdit },
    { label: "Arquivar", onClick: confirmArchive, tone: "danger" },
  ]}
/>
```

### O que NÃO deve fazer

- não exibir todas as ações como botões abertos por padrão;
- não disparar ação destrutiva sem camada de confirmação da página;
- não acoplar callbacks de negócio internos.
