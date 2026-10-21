export type QuestionFilters = { concursoId?: string; cargo?: string; disciplina?: string; assunto?: string; banca?: string; nivel?: string; dificuldade?: string };
export type QuestionOption = { id: string; concursoId: string | null; cargo: string | null; disciplina: string; assunto: string; banca: string | null; nivel: string | null; dificuldade: string };

export function matchesQuestionFilters(question: Omit<QuestionOption, "id">, filters: QuestionFilters): boolean {
  const same = (value: string | null, selected?: string) => !selected || value?.localeCompare(selected, "pt-BR", { sensitivity: "accent" }) === 0;
  return (!filters.concursoId || question.concursoId === filters.concursoId)
    && same(question.cargo, filters.cargo) && same(question.disciplina, filters.disciplina)
    && same(question.assunto, filters.assunto) && same(question.banca, filters.banca)
    && same(question.nivel, filters.nivel) && (!filters.dificuldade || question.dificuldade === filters.dificuldade);
}
