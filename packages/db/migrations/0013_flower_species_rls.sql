-- RLS for flower_species
ALTER TABLE public.flower_species ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_active_flower_species"
  ON public.flower_species
  FOR SELECT
  USING (is_active = true);

CREATE POLICY "admin_manage_flower_species"
  ON public.flower_species
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- RLS for flower_variants
ALTER TABLE public.flower_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_active_flower_variants"
  ON public.flower_variants
  FOR SELECT
  USING (is_active = true);

CREATE POLICY "admin_manage_flower_variants"
  ON public.flower_variants
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
