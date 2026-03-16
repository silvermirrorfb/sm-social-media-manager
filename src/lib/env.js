function stripWrappingQuotes(value) {
  if (typeof value !== 'string') return '';

  const trimmed = value.trim();
  if (!trimmed) return '';

  const firstChar = trimmed[0];
  const lastChar = trimmed[trimmed.length - 1];
  if ((firstChar === '"' || firstChar === "'") && firstChar === lastChar) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

export function getEnv(...keys) {
  for (const key of keys) {
    const value = stripWrappingQuotes(process.env[key]);
    if (value) return value;
  }

  return '';
}

export function hasEnv(...keys) {
  return Boolean(getEnv(...keys));
}
