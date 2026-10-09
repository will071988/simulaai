import type { Metadata } from "next";
import Link from "next/link";
import { Header, Footer } from "@/components/Header";

export const metadata: Metadata = {
  title: "Política de Privacidade | SimulaAí",
  description: "Entenda quais dados o SimulaAí trata, para quais finalidades e como exercer seus direitos.",
  alternates: { canonical: "/privacidade" },
};

export default function PrivacyPage() {
  return <div className="mesh min-h-screen"><Header /><main className="mx-auto max-w-4xl px-6 py-10">
    <h1 className="font-display text-4xl font-bold">Política de Privacidade</h1>
    <p className="mt-2 text-sm text-white/50">Última atualização: 09/10/2026</p>
    <div className="mt-8 space-y-6 rounded-[28px] bg-white p-7 text-zinc-900">
      <section><h2 className="text-xl font-bold">1. Escopo</h2><p className="mt-2">Esta política descreve o tratamento de dados pessoais realizado pelo SimulaAí na criação de conta, uso de simulados, acompanhamento de concursos e recursos de estudo.</p></section>
      <section><h2 className="text-xl font-bold">2. Dados tratados</h2><p className="mt-2">Podemos tratar e-mail, nome informado no perfil, identificador de conta, tentativas e respostas de simulados, métricas de desempenho, planos de estudo, concursos favoritados ou seguidos e estado de leitura de notificações. Dados públicos de concursos não são dados pessoais do usuário.</p></section>
      <section><h2 className="text-xl font-bold">3. Finalidades</h2><p className="mt-2">Os dados são usados para autenticação, segurança da conta, histórico de desempenho, personalização do plano de estudo, favoritos, alertas, prevenção de abuso, suporte e operação do serviço.</p></section>
      <section><h2 className="text-xl font-bold">4. Base e minimização</h2><p className="mt-2">O SimulaAí procura coletar apenas os dados necessários para prestar os recursos solicitados e proteger a plataforma. Recursos opcionais, como acompanhamento de concursos, dependem de uma ação explícita do usuário.</p></section>
      <section><h2 className="text-xl font-bold">5. Compartilhamento e operadores</h2><p className="mt-2">A infraestrutura utiliza fornecedores técnicos para hospedagem, banco de dados, autenticação e processamento automatizado. Eles recebem somente o necessário para executar essas funções. Chaves, senhas e segredos internos não são expostos ao usuário ou usados como conteúdo de exportação.</p></section>
      <section><h2 className="text-xl font-bold">6. IA</h2><p className="mt-2">Recursos de IA podem ser usados para extração de dados públicos de concursos e correções ou explicações. O sistema deve evitar enviar credenciais ou dados pessoais desnecessários aos provedores de IA.</p></section>
      <section><h2 className="text-xl font-bold">7. Retenção e exclusão</h2><p className="mt-2">Os dados vinculados à conta são mantidos enquanto necessários ao serviço. Ao excluir a conta, registros diretamente vinculados são removidos conforme as relações do banco. Tentativas podem ser mantidas de forma desvinculada da identidade para integridade estatística, sem o identificador do usuário.</p></section>
      <section><h2 className="text-xl font-bold">8. Seus direitos</h2><p className="mt-2">Na área <Link href="/conta" className="font-bold text-violet-700">Minha conta</Link>, você pode consultar o perfil, baixar uma cópia dos dados associados à conta e solicitar a exclusão da conta. Pedidos adicionais podem ser tratados pelo canal de suporte que será disponibilizado na própria plataforma.</p></section>
      <section><h2 className="text-xl font-bold">9. Segurança</h2><p className="mt-2">São usados controles de autenticação, isolamento por usuário, políticas de acesso no banco, proteção de segredos e validações de API. Nenhum sistema é infalível; incidentes relevantes serão tratados conforme as obrigações aplicáveis.</p></section>
      <section><h2 className="text-xl font-bold">10. Alterações</h2><p className="mt-2">Esta política pode ser atualizada quando o produto, os fornecedores ou as obrigações aplicáveis mudarem. A data de atualização será mantida nesta página.</p></section>
    </div>
  </main><Footer /></div>;
}
