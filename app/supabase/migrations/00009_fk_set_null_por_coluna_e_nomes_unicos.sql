-- =============================================================================
-- 00009 — FKs com SET NULL por coluna e nomes únicos em cadastros
--
-- DEFEITO QUE ESTA MIGRATION CONSERTA, provado no banco real antes de escrevê-la
-- (teste tests/integration/categorias-crud.mjs, execução vermelha):
--
-- Na 00001, quatro chaves estrangeiras COMPOSTAS (com family_id) usam
-- ON DELETE SET NULL sem dizer QUAL coluna zerar. Nesse caso o Postgres zera
-- TODAS as colunas da chave — inclusive family_id, que é NOT NULL. Por isso:
--
--   excluir uma categoria usada em lançamento
--     -> 23502: null value in column "family_id" of relation "transactions"
--   excluir uma forma de pagamento usada em lançamento
--     -> 23502, a mesma coisa
--   excluir um usuário que já teve conta (todo mundo que criou ou entrou numa
--   família ganha a conta "Conta de <nome>")
--     -> "Database error deleting user"
--
-- O terceiro caso é o mais sério: nenhum usuário que já usou o app consegue ser
-- removido. Ele também explica os usuários de teste que vinham sobrando no
-- banco: a limpeza dos testes tentava apagar e o erro era engolido.
--
-- As quatro chaves, com o nome real que o Postgres deu a elas (inventário via
-- pg_constraint no banco hospedado, PostgreSQL 17.11):
--   accounts_family_id_owner_member_id_fkey          -> family_members
--   transactions_family_id_owner_member_id_fkey      -> family_members
--   transactions_family_id_category_id_fkey          -> categories
--   transactions_family_id_payment_method_id_fkey    -> payment_methods
--
-- A CORREÇÃO: recriar as quatro dizendo a coluna que deve ser zerada,
--   ON DELETE SET NULL (category_id)
-- sintaxe disponível desde o PostgreSQL 15. Assim, excluir uma categoria deixa
-- o lançamento "Sem categoria" e mantém o lançamento na família certa.
--
-- O comportamento PRETENDIDO pela 00001 não muda — ela já queria SET NULL. Só
-- passa a funcionar.
--
-- Esta migration também cria os índices únicos que impedem duas categorias (ou
-- duas formas de pagamento) ativas com o mesmo nome na mesma família. Antes de
-- escrevê-los foi conferido que não há duplicata no banco, nem nas famílias de
-- teste: as duas consultas de GROUP BY ... HAVING count(*) > 1 voltaram vazias
-- (1095 categorias ativas, 438 formas ativas).
--
-- 00001..00008 estão aplicadas e são IMUTÁVEIS: tudo aqui é statement novo.
-- A migration roda inteira numa transação: ou tudo entra, ou nada entra.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- BLOCO 1 — As quatro chaves estrangeiras, agora zerando só a coluna certa
--
-- DROP + ADD com o MESMO nome, para quem consulta pg_constraint continuar
-- encontrando a chave onde sempre esteve. O ADD revalida as linhas existentes:
-- as tabelas são pequenas (dezenas de lançamentos), então a trava é curta.
-- -----------------------------------------------------------------------------

-- Conta cujo dono saiu da família continua existindo, sem dono.
ALTER TABLE public.accounts
  DROP CONSTRAINT IF EXISTS accounts_family_id_owner_member_id_fkey;
ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_family_id_owner_member_id_fkey
  FOREIGN KEY (family_id, owner_member_id)
  REFERENCES public.family_members (family_id, id)
  ON DELETE SET NULL (owner_member_id);

-- Lançamento de quem saiu da família passa a ser "compartilhado" (sem dono).
ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_family_id_owner_member_id_fkey;
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_family_id_owner_member_id_fkey
  FOREIGN KEY (family_id, owner_member_id)
  REFERENCES public.family_members (family_id, id)
  ON DELETE SET NULL (owner_member_id);

-- Lançamento cuja categoria foi excluída fica "Sem categoria".
ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_family_id_category_id_fkey;
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_family_id_category_id_fkey
  FOREIGN KEY (family_id, category_id)
  REFERENCES public.categories (family_id, id)
  ON DELETE SET NULL (category_id);

-- Lançamento cuja forma de pagamento foi excluída fica sem forma.
ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_family_id_payment_method_id_fkey;
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_family_id_payment_method_id_fkey
  FOREIGN KEY (family_id, payment_method_id)
  REFERENCES public.payment_methods (family_id, id)
  ON DELETE SET NULL (payment_method_id);


-- -----------------------------------------------------------------------------
-- BLOCO 2 — Nome ativo único por família
--
-- Categorias: único por (família, nome, tipo). "Pet" como despesa e "Pet" como
-- receita podem coexistir; duas "Pet" de despesa, não.
-- Formas de pagamento: único por (família, nome).
--
-- lower(btrim(name)): "Pet", "pet" e " PET " são o mesmo nome. Acento NÃO é
-- ignorado aqui ("Saúde" e "Saude" passariam no índice); quem barra essa
-- duplicata é a Server Action, que compara sem acento antes de gravar. O índice
-- é a rede de segurança do banco para o caso mais comum (maiúscula/minúscula),
-- e é ele que segura duas gravações simultâneas que a action, sozinha, não
-- consegue segurar.
--
-- WHERE archived_at IS NULL: o índice é PARCIAL. Uma categoria arquivada não
-- ocupa o nome — dá para arquivar "Pet" e criar outra "Pet" do zero. O preço:
-- REATIVAR a antiga enquanto a nova existir esbarra no índice (23505), e a
-- action devolve mensagem em português para esse caso.
--
-- O nome do índice é usado por src/actions/resultado.ts para escolher a
-- mensagem do erro 23505. Não renomeie um sem o outro.
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS categories_nome_ativo_unico
  ON public.categories (family_id, lower(btrim(name)), type)
  WHERE archived_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payment_methods_nome_ativo_unico
  ON public.payment_methods (family_id, lower(btrim(name)))
  WHERE archived_at IS NULL;


-- -----------------------------------------------------------------------------
-- BLOCO 3 — Rede de proteção: a migration se recusa a terminar se sobrou
-- alguma chave estrangeira em public com SET NULL sem lista de colunas.
--
-- O teste é pela DEFINIÇÃO que o Postgres devolve: com lista ela termina em
-- "SET NULL (coluna)"; sem lista, termina em "SET NULL". O regex foi executado
-- antes contra as duas formas (casa a defeituosa, não casa a corrigida, nem
-- RESTRICT, nem CASCADE).
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_erros text := '';
  v_fk    record;
BEGIN
  FOR v_fk IN
    SELECT c.conname, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.connamespace = 'public'::regnamespace
      AND pg_get_constraintdef(c.oid) ~ 'ON DELETE SET NULL$'
  LOOP
    v_erros := v_erros || ' ' || v_fk.conname || ' ainda zera todas as colunas;';
  END LOOP;

  IF (SELECT count(*) FROM pg_constraint c
      WHERE c.contype = 'f'
        AND c.connamespace = 'public'::regnamespace
        AND c.conname IN ('accounts_family_id_owner_member_id_fkey',
                          'transactions_family_id_owner_member_id_fkey',
                          'transactions_family_id_category_id_fkey',
                          'transactions_family_id_payment_method_id_fkey')) <> 4 THEN
    v_erros := v_erros || ' alguma das 4 chaves nao foi recriada;';
  END IF;

  IF to_regclass('public.categories_nome_ativo_unico') IS NULL THEN
    v_erros := v_erros || ' indice categories_nome_ativo_unico ausente;';
  END IF;
  IF to_regclass('public.payment_methods_nome_ativo_unico') IS NULL THEN
    v_erros := v_erros || ' indice payment_methods_nome_ativo_unico ausente;';
  END IF;

  IF v_erros <> '' THEN
    RAISE EXCEPTION 'Migration 00009 abortada:%', v_erros;
  END IF;

  RAISE NOTICE 'Migration 00009: 4 chaves com SET NULL por coluna e 2 indices unicos verificados.';
END $$;
