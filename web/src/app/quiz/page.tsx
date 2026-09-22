import type { Metadata } from "next";
import QuizClient from "./QuizClient";

export const metadata: Metadata = {
  title: "Quiz: Qual concurso combina com você? | SimulaAí",
  description: "Responda algumas perguntas e descubra quais concursos mais combinam com seu perfil, rotina e objetivos.",
};

export default function QuizPage() {
  return <QuizClient />;
}
