-- gut_024 — Operações de finalização interna na ficha do produto (v4.24.0).
-- Marcadas como "só interno": na remessa "Peça pronta" a facção faz todo o resto; na volta, as peças
-- aprovadas caem em "Aguardando destino" como lote de finalização (cupons só dessas operações).
alter table public.roteiro_produto add column if not exists so_interno boolean;
