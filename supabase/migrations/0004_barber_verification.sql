-- Fase 3: barber-onboarding echt werkend maken (profielfoto, diploma,
-- beschikbaarheid + Storage-buckets voor de verificatie-uploads).
-- Voer uit ná 0001-0003.

-- ============================================================
-- barber_profiles: nieuwe kolommen
-- ============================================================

alter table public.barber_profiles add column avatar_url text;
alter table public.barber_profiles add column diploma_url text;
alter table public.barber_profiles add column availability jsonb not null default
  '{"Ma":true,"Di":true,"Wo":true,"Do":true,"Vr":true,"Za":true,"Zo":false}';

comment on column public.barber_profiles.avatar_url is
  'Publieke URL in de barber-media-bucket.';
comment on column public.barber_profiles.diploma_url is
  'Storage-pad in de privé barber-documents-bucket (geen publieke URL) — optioneel document, zie ook id_doc_url/insurance_doc_url uit 0003.';
comment on column public.barber_profiles.availability is
  'Simpele dag->aan/uit-map (Ma..Zo), matcht de huidige beschikbaarheid-UI die alleen per dag toggelt. Als de UI ooit tijdvakken per dag nodig heeft, wordt dit een aparte tabel via een nieuwe migratie.';

-- Bestaande kolom-grant uit 0003 uitbreiden (cumulatief, geen herhaling
-- van de revoke/grant-select nodig):
grant update (avatar_url, diploma_url, availability)
  on public.barber_profiles to authenticated;

-- ============================================================
-- Storage: barber-media (publiek — avatar + portfolio) en
-- barber-documents (privé — ID/verzekering/diploma)
-- ============================================================

insert into storage.buckets (id, name, public)
values
  ('barber-media', 'barber-media', true),
  ('barber-documents', 'barber-documents', false)
on conflict (id) do nothing;

-- Padconventie: {bucket}/{auth.uid()}/... — (storage.foldername(name))[1]
-- is het eerste pad-segment, gebruikt om eigenaarschap af te dwingen.

create policy "Barbers can upload own media"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'barber-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Barbers can update own media"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'barber-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Barbers can delete own media"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'barber-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Barber media is publicly viewable"
  on storage.objects for select
  using (bucket_id = 'barber-media');

create policy "Barbers can manage own documents"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'barber-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'barber-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Geen select-policy voor barber-documents buiten de eigenaar — bewust
-- nooit publiek leesbaar, ook niet via een aparte policy.
