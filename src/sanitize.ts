const dangerousCodePoint = /[\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}]/u;

export function visibleText(value: string): string {
  let output = "";

  for (const character of value) {
    output += dangerousCodePoint.test(character)
      ? `\\u{${character.codePointAt(0)?.toString(16) ?? "0"}}`
      : character;
  }

  return output;
}

export function safeDisplayPath(value: string): string {
  const normalized = value.replaceAll("\\", "/");
  const withoutAbsolutePrefix =
    normalized.startsWith("/") || /^[A-Za-z]:\//u.test(normalized)
      ? (normalized.split("/").filter(Boolean).at(-1) ?? ".")
      : normalized;

  return visibleText(withoutAbsolutePrefix);
}
