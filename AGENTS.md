# AGENTS.md — Arquitetura de Subagentes Especializados do Finanças a Dois

> **Versão:** 1.0.0 (2026-11-20)  
> **Propósito:** Definir os subagentes especializados para cada módulo e disciplina de desenvolvimento dos briefings, otimizando contexto, tempo de resposta e garantindo qualidade e segurança de ponta a ponta.

---

## 1. Visão Geral da Arquitetura Multi-Agente

O desenvolvimento do **Finanças a Dois** é organizado em rodadas iterativas orientadas por briefings técnicos. Para evitar poluição de contexto e garantir máxima profundidade técnica em cada disciplina, o trabalho é dividido em **6 subagentes especializados**, coordenados pelo **Maestro**:

```mermaid
flowchart TD
    User([Usuário / Heitor]) --> Maestro[Maestro\nOrquestrador & Compilador de Briefings]
    
    Maestro -->|Briefing de Banco/Actions| Estrutura[Estrutura\nBackend, DB & Server Actions]
    Maestro -->|Briefing de Visualização| Dash[Dash\nGráficos & Matemática Financeira]
    
    Estrutura -->|Contratos & Schemas| Fachada[Fachada\nFrontend UI & Interações]
    Dash -->|Componente de Gráfico| Fachada
    
    Fachada -->|UI Integrada| Semeador[Semeador\nFixtures & Verificação Visual Playwright]
    Semeador -->|Evidências & Screenshots| Sentinela[Sentinela\nAuditor de Segurança, Privacidade & QA]
    
    Sentinela -->|Veredito do Gate| Maestro
    Maestro -->|Relatório Consolidado| User
```

---

## 2. Catálogo de Subagentes Especializados

### 2.1 `maestro` — Orquestrador & Compilador de Briefings
- **Papel:** Technical Lead & Solution Architect.
- **Responsabilidades:**
  - Decompor demandas de produto recebidas do Heitor em especificações técnicas acionáveis.
  - Elaborar briefings estruturados (`BRIEFING-FRONTEND-RODADA*.md`, `docs/planos/*.md`) com seções obrigatórias:
    - **Seção 0:** Estado de partida conferido no código (`VERIFICADO` vs `A PROVAR`).
    - **Seção 1:** Regras inegociáveis de segurança.
    - **Seção 2:** Escopo priorizado item a item (`F-1`, `F-2`, etc.).
    - **Seção 3:** O que NÃO fazer (fronteiras e arquivos intocáveis).
    - **Seção 4:** Critérios objetivos de verificação (`tsc`, `vitest`, screenshots responsivos).
    - **Seção 5:** Checklist para auditoria do Sentinela.
  - Alinhar contratos e dependências entre os subagentes.
  - Consolidar relatórios de entrega e gerenciar o deploy de produção.

### 2.2 `estrutura` — Arquiteto de Backend, Banco & Server Actions
- **Papel:** Database & Server-Side Engineer.
- **Responsabilidades:**
  - Migrations versionadas do PostgreSQL no Supabase (`app/supabase/migrations/*.sql`).
  - Políticas RLS rigorosas garantindo tenancy multi-tenant por `family_id`.
  - Criação de views analíticas sempre com `WITH (security_invoker = true)`.
  - Server Actions em `app/src/actions/*.ts` devolvendo contrato padronizado:
    ```ts
    type ResultadoAction<T> =
      | { ok: true; dados: T }
      | { ok: false; erro: string; camposComErro?: Record<string, string[]> }
    ```
  - Schemas de validação Zod em `app/src/lib/esquemas-*.ts`.
  - Queries de servidor em `app/src/lib/queries/*.ts` isoladas com `import 'server-only'`.
  - Testes de integridade de RLS e constraints de banco com rollback automático.

### 2.3 `fachada` — Engenheiro de Frontend, Componentes & UX
- **Papel:** UI Engineer & Interaction Specialist.
- **Responsabilidades:**
  - Páginas e layouts no Next.js 16 App Router (`app/src/app/(app)/...`).
  - Componentes reutilizáveis em `app/src/components/...` (Tailwind CSS 4 + Radix UI / Shadcn).
  - Tratamento visual de erros de formulário: mapeamento de `camposComErro` para `<CampoErro id="..." mensagens={...} />`.
  - Modais e diálogos com transições fluidas e micro-haptics (`hapticFeedback` de `@/lib/haptics`).
  - Blindagem do Modo Privacidade (`useOcultarValores()` via `<ValorMonetario />`).
  - Responsividade mobile-first testada em 375px (iPhone SE), 768px (iPad) e 1440px (Desktop).
  - Proibição estrita de jargões corporativos (ex: nunca usar "Transferir", usar "Aplicar", "Alocar", "Resgatar").

### 2.4 `dash` — Visualização de Dados & Matemática Financeira
- **Papel:** Financial Data Visualization & Precision Math Specialist.
- **Responsabilidades:**
  - Componentes de gráficos interativos de alta fidelidade (SVG/canvas responsivo).
  - Cálculo de juros compostos, projeções e amortizações operando em **centavos inteiros** (`balance_cents`, `taxaMensalBps`), eliminando erros de arredondamento de float (`Math.pow`).
  - Suporte ao Modo Privacidade nos gráficos: mascaramento de eixos Y, tooltips e marcadores quando o olho estiver fechado.
  - Skeletons de carregamento (`GraficoProjecaoCaixinhaSkeleton`) e estados visuais de erro com retry (`aoTentarNovamente`).
  - Testes unitários de renderização e matemática financeira com Vitest.

### 2.5 `sentinela` — Auditor de Segurança, Privacidade & QA Gate
- **Papel:** Security & Compliance Auditor (Gatekeeper).
- **Responsabilidades:**
  - Auditoria estrita e sem complacência antes de qualquer subida para produção.
  - Verificação de vazamento cross-tenant de dados entre famílias (`family_id`).
  - Verificação de vazamento de valores monetários no Modo Privacidade em qualquer canto do DOM ou atributos (`R$ <número>`).
  - Validação de que todas as Server Actions tratam erros e que os formulários exibem `camposComErro`.
  - Checagem de que a flag `NEXT_PUBLIC_FEATURE_*` permanece desligada na Vercel até o aval final.
  - Emissão de relatórios estruturados com achados classificados em **ALTO** (bloqueante), **MÉDIO** ou **BAIXO**.

### 2.6 `semeador` — Testes Visuais, Fixtures & Playwright
- **Papel:** QA Automation & Visual Verification Specialist.
- **Responsabilidades:**
  - Criação de scripts automatizados de Playwright com Google Chrome real em `scratch/verify-*.mjs`.
  - Cobertura da matriz completa de verificação:
    - 3 resoluções: 375x812, 768x1024, 1440x900.
    - 2 temas: Dark mode e Light mode.
    - Modo Privacidade ativado e desativado.
    - 4 estados de UI: Vazio (banco real), Caixinhas populadas, Rendimentos pendentes e Erro de leitura.
  - Auditoria contínua de logs do navegador (exigência de 0 erros no console).
  - Criação e injeção de fixtures sintéticas seguras em desenvolvimento, garantindo zero mutações contra o banco de produção.

---

## 3. Fluxo Operacional de uma Rodada

Para cada novo briefing ou evolução:

1. **Início da Rodada:** O `maestro` recebe a solicitação do Heitor, audita o repositório, valida se há pré-requisitos abertos e compila o briefing técnico estruturado (`BRIEFING-FRONTEND-RODADA<N>.md`).
2. **Construção de Infraestrutura & Backend:** O `estrutura` cria as migrations SQL, esquemas Zod e Server Actions correspondentes. Em paralelo, se houver gráficos, o `dash` implementa os componentes visuais e a lógica de projeção.
3. **Construção de UI & UX:** O `fachada` conecta as Server Actions do `estrutura` e os gráficos do `dash` nas páginas e componentes, garantindo estados de loading, erro, acessibilidade e haptics.
4. **Verificação Visual Automatizada:** O `semeador` executa os scripts de Playwright, gera a bateria completa de screenshots e certifica o console limpo (0 erros).
5. **Auditoria do Gate:** O `sentinela` audita o código, os testes e os screenshots. Se aprovado, emite o parecer.
6. **Finalização:** O `maestro` realiza os commits atômicos por arquivo, executa `git pull --rebase` e `git push origin main`, e devolve o relatório consolidado ao Heitor.

---

## 4. Regras Inegociáveis de Segurança

1. **Banco Único de Produção:** O app conecta exclusivamente ao banco Supabase de produção. NENHUM subagente pode disparar Server Actions ou scripts de escrita contra o banco de produção em testes automatizados.
2. **Gate do Sentinela:** Nenhuma feature flag pode ser ativada na Vercel de produção sem o parecer favorável do Sentinela.
3. **Preservação de Código e Testes:** `npx tsc --noEmit` deve manter 0 erros e `npx vitest run tests/unit` deve manter 100% dos testes passando antes de qualquer commit.
