-- Categories: English URL part, unique per parent (/c/{main}/{sub})
DROP INDEX "Category_slug_key";
CREATE UNIQUE INDEX "Category_parentId_slug_key" ON "Category"("parentId", "slug");

-- Items: short public number instead of a text slug (/c/{main}/{sub}/{code})
DROP INDEX "Item_slug_key";
ALTER TABLE "Item" DROP COLUMN "slug",
ADD COLUMN     "code" SERIAL NOT NULL;
CREATE UNIQUE INDEX "Item_code_key" ON "Item"("code");

-- Start item numbers at 1001 so URLs look like /1024 rather than /3
UPDATE "Item" SET "code" = "code" + 1000;
SELECT setval(pg_get_serial_sequence('"Item"', 'code'), GREATEST(1000, (SELECT COALESCE(MAX("code"), 0) FROM "Item")));
