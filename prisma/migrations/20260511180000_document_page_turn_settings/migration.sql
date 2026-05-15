-- Paramètres additionnels du panneau « effet des pages » (booléens), sérialisés en JSON.
ALTER TABLE "Document" ADD COLUMN "pageTurnSettings" JSONB;
ALTER TABLE "DocumentShare" ADD COLUMN "pageTurnSettings" JSONB;
