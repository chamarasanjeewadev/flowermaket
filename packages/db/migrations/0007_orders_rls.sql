-- RLS for order-fulfilment tables. The app connects as table owner (bypasses
-- RLS); these policies guard the anon/authenticated PostgREST path.

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.order_item_awards ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.document_otps ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.rfqs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.rfq_quote_lines ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Admins: full access to every order-fulfilment table.
CREATE POLICY orders_admin_all ON public.orders FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
--> statement-breakpoint
CREATE POLICY order_items_admin_all ON public.order_items FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
--> statement-breakpoint
CREATE POLICY awards_admin_all ON public.order_item_awards FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
--> statement-breakpoint
CREATE POLICY documents_admin_all ON public.documents FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
--> statement-breakpoint

-- Suppliers: read RFQs addressed to a shop they own; write their own quote lines.
CREATE POLICY rfqs_supplier_read ON public.rfqs FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.shops s WHERE s.id = rfqs.supplier_shop_id AND s.owner_user_id = auth.uid())
);
--> statement-breakpoint
CREATE POLICY rfqs_admin_all ON public.rfqs FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
--> statement-breakpoint
CREATE POLICY quote_lines_supplier_rw ON public.rfq_quote_lines FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.rfqs r JOIN public.shops s ON s.id = r.supplier_shop_id
    WHERE r.id = rfq_quote_lines.rfq_id AND s.owner_user_id = auth.uid()
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.rfqs r JOIN public.shops s ON s.id = r.supplier_shop_id
    WHERE r.id = rfq_quote_lines.rfq_id AND s.owner_user_id = auth.uid()
  )
);
--> statement-breakpoint
CREATE POLICY quote_lines_admin_all ON public.rfq_quote_lines FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
--> statement-breakpoint

-- document_otps: server-only. No anon/authenticated policy => deny all via RLS.
-- (The public document view reads through the app owner connection, not PostgREST.)
