-- Airalo eSIMs Cloud share link + access code (not the LPA install secret).
ALTER TABLE "esim_profiles" ADD COLUMN "sharing_link" VARCHAR(512);
ALTER TABLE "esim_profiles" ADD COLUMN "sharing_access_code" VARCHAR(32);
