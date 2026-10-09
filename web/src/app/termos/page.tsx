import type { Metadata } from "next";
import { Header, Footer } from "@/components/Header";

export const metadata: Metadata = {
  title: "Termos de Uso | SimulaAí",
  description: "Regras de uso do SimulaAí, limites das informações e responsabilidades da plataforma.",
  alternates: { canonical: "/termos" },
};

export default function TermsPage() {
  return <div className="mesh min-h-screen"><Header /><main className="mx-auto max-w-4xl px-6 py-10">
    <h1 className="font-display text-4xl font-bold">Termos de Uso</h1>
    <p className="mt-2 text-sm text-white/50">Última atualização: 09/10/2026</p>
    <div className="mt-8 space-y-6 rounded-[28px] bg-white p-7 text-zinc-900">
      <section><h2 className="text-xl font-bold">1. Serviço</h2><p className="mt-2">O SimulaAí oferece simulados, organização de estudos, acompanhamento de concursos e recursos automatizados de apoio ao estudo.</p></section>
      <section><h2 className="text-xl font-bold">2. Fontes e caráter informativo</h2><p className="mt-2">O SimulaAí não é órgão público, banca examinadora nem representante oficial de concursos. Editais, datas, vagas, remunerações e demais informações devem ser confirmados nas fontes oficiais indicadas.</p></section>
      <section><h2 className="text-xl font-bold">3. Conteúdo e IA</h2><p className="mt-2">Correções e explicações automatizadas auxiliam o estudo, mas podem conter limitações. O usuário não deve tratar uma resposta de IA como fonte oficial, parecer profissional ou garantia de aprovação.</p></section>
      <section><h2 className="text-xl font-bold">4. Conta</h2><p className="mt-2">O usuário é responsável por proteger suas credenciais e por fornecer dados verdadeiros. A conta não deve ser compartilhada para contornar limites, controles de segurança ou regras de planos.</p></section>
      <section><h2 className="text-xl font-bold">5. Uso aceitável</h2><p className="mt-2">É proibido tentar invadir a plataforma, extrair segredos, automatizar abuso, burlar controles de acesso, distribuir conteúdo protegido sem autorização ou usar o serviço de forma ilícita.</p></section>
      <section><h2 className="text-xl font-bold">6. Planos pagos</h2><p className="mt-2">Preços, periodicidade, renovação, cancelamento e eventuais reembolsos serão apresentados antes da contratação. Nenhuma cobrança deve ocorrer sem fluxo de pagamento explícito e confirmação do usuário.</p></section>
      <section><h2 className="text-xl font-bold">7. Disponibilidade</h2><p className="mt-2">A plataforma pode passar por manutenção, indisponibilidade de fornecedores ou alterações técnicas. Não é garantida disponibilidade ininterrupta.</p></section>
      <section><h2 className="text-xl font-bold">8. Encerramento</h2><p className="mt-2">Contas podem ser suspensas em caso de fraude, abuso ou violação relevante destes termos, respeitadas as obrigações legais aplicáveis.</p></section>
    </div>
  </main><Footer /></div>;
}
