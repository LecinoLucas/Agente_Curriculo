# Example Usage

Exemplo em pseudo-React/TypeScript. Não implementar nesta fase.

Objetivo do exemplo:

- header compacto;
- métricas;
- toolbar;
- tabela principal;
- drawer de edição;
- nenhum formulário aberto por padrão.

```tsx
export function FakeDocumentsAdminPage() {
  const [selectedDocument, setSelectedDocument] = useState<DocumentRow | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const metrics = [
    { label: "Total", value: 42 },
    { label: "Publicados", value: 30, tone: "success" },
    { label: "Pendentes", value: 9, tone: "warning" },
    { label: "Erros", value: 3, tone: "danger" },
  ];

  return (
    <AdminListPage
      eyebrow="Admin / IA"
      title="Documentos"
      description="Gerencie documentos usados pelo sistema."
      primaryAction={
        <Button onClick={() => setIsEditorOpen(true)}>
          Novo documento
        </Button>
      }
      secondaryActions={
        <>
          <Button variant="outline">Exportar</Button>
          <Button variant="outline">Atualizar</Button>
        </>
      }
      metrics={<AdminMetricStrip items={metrics} />}
      filters={
        <AdminToolbar
          search={<Input placeholder="Buscar documento" />}
          filters={<Select defaultValue="all">...</Select>}
          sort={<Select defaultValue="recent">...</Select>}
        />
      }
    >
      <AdminEntityList
        columns={[
          { key: "title", label: "Documento" },
          { key: "status", label: "Status" },
          { key: "updatedAt", label: "Atualizado em" },
          { key: "actions", label: "Ações", align: "right" },
        ]}
        rows={documents}
        loading={false}
        emptyState={{
          title: "Nenhum documento encontrado",
          description: "Crie o primeiro item para começar.",
          primaryAction: <Button>Novo documento</Button>,
        }}
        renderRow={(doc) => (
          <tr key={doc.id}>
            <td>{doc.title}</td>
            <td><StatusBadge>{doc.status}</StatusBadge></td>
            <td>{doc.updatedAt}</td>
            <td>
              <RowActions
                actions={[
                  {
                    label: "Ver detalhes",
                    onClick: () => {
                      setSelectedDocument(doc);
                      setIsEditorOpen(false);
                    },
                  },
                  {
                    label: "Editar",
                    onClick: () => {
                      setSelectedDocument(doc);
                      setIsEditorOpen(true);
                    },
                  },
                  {
                    label: "Arquivar",
                    tone: "danger",
                    onClick: () => confirmArchive(doc.id),
                  },
                ]}
              />
            </td>
          </tr>
        )}
      />

      <AdminSidePanel
        open={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        title={selectedDocument ? "Editar documento" : "Novo documento"}
        description="Preencha os campos apenas quando quiser criar ou editar."
        footer={
          <>
            <Button variant="outline" onClick={() => setIsEditorOpen(false)}>
              Cancelar
            </Button>
            <Button>Salvar</Button>
          </>
        }
      >
        <DocumentForm />
      </AdminSidePanel>
    </AdminListPage>
  );
}
```

## O que este exemplo prova

- a tela abre mostrando lista, não formulário;
- o CTA principal é único;
- filtros ficam separados na toolbar;
- ações por linha ficam compactas;
- criação e edição só aparecem após ação explícita;
- detalhe e edição usam painel sob demanda.

## O que este exemplo evita

- formulário vazio aberto por padrão;
- chunks ou conteúdo longo já expandidos;
- vários cards grandes competindo;
- múltiplos botões primários no topo;
- ação destrutiva aberta e destacada demais.
