-- Airalo low-data webhooks and top-up need ICCID lookup on stored profiles.
ALTER TABLE "esim_profiles" ADD COLUMN "iccid" VARCHAR(32);

-- PostgreSQL UNIQUE allows multiple NULLs.
CREATE UNIQUE INDEX "esim_profiles_iccid_key" ON "esim_profiles"("iccid");
