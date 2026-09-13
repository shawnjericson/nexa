-- Full-text search in PostgreSQL (ADR-018): accent-insensitive, maintained by the database.

-- unaccent is a trusted extension, so the database owner can create it.
CREATE EXTENSION IF NOT EXISTS unaccent;

-- unaccent() is only STABLE because its dictionary could change; generated columns need an
-- IMMUTABLE function, so this wrapper pins the dictionary. "Báo cáo Đà Nẵng" -> "Bao cao Da Nang".
CREATE OR REPLACE FUNCTION nexa_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

-- The 'simple' configuration lowercases words without stemming, which suits Vietnamese (no
-- stemmer exists) and names. Generated columns are updated in the same statement as the row,
-- so search never lags behind writes (risk register 14.1).
ALTER TABLE "users" ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple'::regconfig, nexa_unaccent("display_name" || ' ' || "username"::text))
  ) STORED;

ALTER TABLE "posts" ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, nexa_unaccent("content"))) STORED;

ALTER TABLE "conversations" ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    to_tsvector(
      'simple'::regconfig,
      nexa_unaccent(coalesce("name", '') || ' ' || coalesce("description", ''))
    )
  ) STORED;

ALTER TABLE "messages" ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, nexa_unaccent("content"))) STORED;

-- CreateIndex
CREATE INDEX "users_search_vector_idx" ON "users" USING GIN ("search_vector");

-- CreateIndex
CREATE INDEX "posts_search_vector_idx" ON "posts" USING GIN ("search_vector");

-- CreateIndex
CREATE INDEX "conversations_search_vector_idx" ON "conversations" USING GIN ("search_vector");

-- CreateIndex
CREATE INDEX "messages_search_vector_idx" ON "messages" USING GIN ("search_vector");
