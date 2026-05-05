import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "../../../components/common/EmptyState";
import { SkeletonRows } from "../../../components/common/Skeleton";
import type { Skill } from "../../../types/domain";
import { renderAliasBadges } from "../utils/skillHelpers";

interface SkillsTableProps {
  loading: boolean;
  error: string | null;
  items: Skill[];
  total: number;
  hasActiveSearch: boolean;
  isEmptyState: boolean;
  onEdit: (skill: Skill) => void;
  onDelete: (skillId: string) => void;
  onClearSearch: () => void;
  onCreateNew: () => void;
}

function renderAliasBadgesDisplay(aliases: string[]) {
  const { visible, remaining } = renderAliasBadges(aliases);

  if (!aliases.length) {
    return <span className="text-sm text-[hsl(var(--text-muted))]">—</span>;
  }

  return (
    <div className="flex max-w-full flex-wrap gap-1.5">
      {visible.map((alias) => (
        <span
          key={alias}
          className="inline-flex max-w-full items-center truncate rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-2 py-0.5 text-xs text-[hsl(var(--text))]"
          title={alias}
        >
          {alias}
        </span>
      ))}
      {remaining > 0 ? (
        <span
          className="inline-flex items-center rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-2 py-0.5 text-xs text-[hsl(var(--text-muted))]"
          title={aliases.slice(3).join(", ")}
        >
          +{remaining}
        </span>
      ) : null}
    </div>
  );
}

export function SkillsTable({
  loading,
  error,
  items,
  total,
  hasActiveSearch,
  isEmptyState,
  onEdit,
  onDelete,
  onClearSearch,
  onCreateNew,
}: SkillsTableProps) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        {loading ? (
          <div className="px-0 py-0">
            <SkeletonRows rows={6} />
          </div>
        ) : null}

        {error ? (
          <div className="flex items-center gap-2 px-4 py-6 text-sm text-[hsl(var(--danger))]">
            <span className="font-semibold">!</span>
            <span>{error}</span>
          </div>
        ) : null}

        {isEmptyState ? (
          <EmptyState
            icon={hasActiveSearch ? "🔎" : "🎯"}
            title={hasActiveSearch ? "Nenhuma skill encontrada" : "Nenhuma skill cadastrada"}
            description={
              hasActiveSearch
                ? "A busca atual não encontrou skills por nome ou alias."
                : "Crie a primeira skill para começar a organizar o banco de talentos."
            }
            action={
              hasActiveSearch
                ? {
                    label: "Limpar busca",
                    onClick: onClearSearch,
                  }
                : {
                    label: "Nova skill",
                    onClick: onCreateNew,
                  }
            }
          />
        ) : null}

        {!loading && !error && total > 0 ? (
          <>
            <div className="border-b border-[hsl(var(--border))] px-4 py-3 sm:px-6">
              <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--text-muted))]">
                {total} {total === 1 ? "skill" : "skills"}
              </p>
            </div>

            {/* Desktop table */}
            <div className="ui-scrollbar hidden max-h-[68vh] overflow-y-auto md:block">
              <Table className="w-full table-fixed">
                <TableHeader className="bg-[hsl(var(--surface-muted))]">
                  <TableRow className="hover:bg-[hsl(var(--surface-muted))]">
                    <TableHead className="w-[24%] min-w-[220px]">Nome</TableHead>
                    <TableHead className="w-[18%]">Categoria</TableHead>
                    <TableHead className="w-[42%]">Aliases</TableHead>
                    <TableHead className="w-[16%] text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((skill) => (
                    <TableRow key={skill.id} className="align-top">
                      <TableCell className="min-w-0 py-4">
                        <div className="min-w-0">
                          <p className="break-words text-sm font-semibold text-[hsl(var(--text))]">
                            {skill.name}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        {skill.category ? (
                          <Badge variant="secondary" className="max-w-full">
                            {skill.category}
                          </Badge>
                        ) : (
                          <span className="text-sm text-[hsl(var(--text-muted))]">—</span>
                        )}
                      </TableCell>
                      <TableCell className="min-w-0 py-4">
                        <div className="max-w-full">{renderAliasBadgesDisplay(skill.aliases ?? [])}</div>
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="flex items-center justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => onEdit(skill)}>
                            Editar
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => onDelete(skill.id)}
                            aria-label={`Excluir ${skill.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile list */}
            <div className="ui-scrollbar grid max-h-[68vh] gap-3 overflow-y-auto p-4 sm:p-6 md:hidden">
              {items.map((skill) => (
                <div
                  key={skill.id}
                  className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4 shadow-sm"
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-semibold text-[hsl(var(--text))]">{skill.name}</p>
                      </div>
                      {skill.category ? <Badge variant="secondary">{skill.category}</Badge> : null}
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--text-muted))]">
                        Aliases
                      </p>
                      <div className="max-w-full">{renderAliasBadgesDisplay(skill.aliases ?? [])}</div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => onEdit(skill)}
                      >
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="min-w-11"
                        onClick={() => onDelete(skill.id)}
                        aria-label={`Excluir ${skill.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
