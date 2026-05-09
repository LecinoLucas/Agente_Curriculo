export function normalizeAliasValue(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function aliasComparisonKey(value: string): string {
  return normalizeAliasValue(value).toLocaleLowerCase("pt-BR");
}

export function renderAliasBadges(aliases: string[]) {
  if (!aliases.length) {
    return { visible: [], remaining: 0 };
  }

  const visible = aliases.slice(0, 3);
  const remaining = aliases.length - visible.length;

  return { visible, remaining };
}
