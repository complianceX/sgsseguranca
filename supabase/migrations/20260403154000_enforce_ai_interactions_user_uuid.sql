-- Endurece public.ai_interactions.user_id como UUID obrigatorio.
-- A migration falha de forma explicita se ainda houver sentinelas/legado
-- ou referencias sem usuario correspondente.

DO $$
DECLARE
  uuid_pattern constant text :=
    '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
  invalid_count bigint;
BEGIN
  SELECT COUNT(*)
  INTO invalid_count
  FROM public.ai_interactions
  WHERE user_id IS NULL
     OR btrim(user_id) = ''
     OR user_id !~* uuid_pattern;

  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Cannot convert public.ai_interactions.user_id to uuid: % invalid row(s)', invalid_count;
  END IF;

  SELECT COUNT(*)
  INTO invalid_count
  FROM public.ai_interactions ai
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE (u.id)::text = ai.user_id
  );

  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Cannot add FK on public.ai_interactions.user_id: % row(s) reference missing users', invalid_count;
  END IF;
END
$$;

ALTER TABLE public.ai_interactions
  ALTER COLUMN user_id TYPE uuid USING (user_id::uuid);

ALTER TABLE public.ai_interactions
  ADD CONSTRAINT "FK_ai_interactions_user_id"
    FOREIGN KEY (user_id) REFERENCES public.users(id);
