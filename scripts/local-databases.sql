-- Runs once, when the local PostgreSQL container starts with an empty volume (compose.yaml).
-- The main database, nexa, is created by the image itself.
CREATE DATABASE nexa_test;
CREATE DATABASE nexa_shadow;
