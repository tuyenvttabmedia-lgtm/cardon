-- Phase 6O29: Category SEO fields + Tag visibility
ALTER TABLE cms_categories
  ADD COLUMN IF NOT EXISTS intro TEXT,
  ADD COLUMN IF NOT EXISTS canonical_url VARCHAR(512),
  ADD COLUMN IF NOT EXISTS og_image_url VARCHAR(512);

ALTER TABLE cms_tags
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false;
