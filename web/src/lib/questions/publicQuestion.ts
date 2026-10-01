type StoredAlternative = { key?: string; letra?: string; text?: string; texto?: string; isCorrect?: boolean; [key: string]: unknown };

export function sanitizePublicAlternatives(value: unknown): Array<{ key: string; text: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const alternative = item as StoredAlternative;
    const key = String(alternative.key || alternative.letra || "").trim().slice(0, 5);
    const text = String(alternative.text || alternative.texto || "").trim().slice(0, 1000);
    return key && text ? [{ key, text }] : [];
  });
}

export function toPublicQuestion(row: Record<string, unknown>) {
  const { resposta_correta: _answer, explicacao: _explanation, validation_errors: _errors, validated_by: _validator, ...safe } = row;
  void _answer; void _explanation; void _errors; void _validator;
  return { ...safe, alternativas: sanitizePublicAlternatives(row.alternativas) };
}
