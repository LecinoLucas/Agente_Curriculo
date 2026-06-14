function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizeAliasValue(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function aliasComparisonKey(value: string): string {
  return stripAccents(normalizeAliasValue(value)).toLocaleLowerCase("pt-BR");
}

export function parseAliasInput(value: string): string[] {
  return value
    .split(",")
    .map(normalizeAliasValue)
    .filter(Boolean);
}

export function dedupeAliases(values: string[]): string[] {
  return values.filter(
    (alias, index, aliases) =>
      aliases.findIndex((candidate) => aliasComparisonKey(candidate) === aliasComparisonKey(alias)) === index,
  );
}

export function renderAliasBadges(aliases: string[]) {
  if (!aliases.length) {
    return { visible: [], remaining: 0 };
  }

  const visible = aliases.slice(0, 3);
  const remaining = aliases.length - visible.length;

  return { visible, remaining };
}
