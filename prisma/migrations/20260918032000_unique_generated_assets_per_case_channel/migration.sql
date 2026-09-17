WITH duplicate_generated_assets AS (
  SELECT ga.id,
         ROW_NUMBER() OVER (PARTITION BY ga."caseId", ga."channelKey" ORDER BY ga."createdAt", ga.id) AS duplicate_rank,
         COUNT(pj.id) OVER (PARTITION BY ga.id) AS publication_job_count,
         COUNT(sf.id) OVER (PARTITION BY ga.id) AS safety_flag_count,
         COUNT(av.id) OVER (PARTITION BY ga.id) AS asset_version_count
  FROM macula.generated_assets ga
  LEFT JOIN macula.publication_jobs pj ON pj."assetId" = ga.id
  LEFT JOIN macula.safety_flags sf ON sf."generatedAssetId" = ga.id
  LEFT JOIN macula.asset_versions av ON av."assetId" = ga.id
), removable_duplicates AS (
  SELECT id
  FROM duplicate_generated_assets
  WHERE duplicate_rank > 1
    AND publication_job_count = 0
    AND safety_flag_count = 0
    AND asset_version_count = 0
)
DELETE FROM macula.generated_assets ga
USING removable_duplicates rd
WHERE ga.id = rd.id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM macula.generated_assets
    GROUP BY "caseId", "channelKey"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add unique generated_assets(caseId, channelKey): duplicate rows with dependencies remain';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "generated_assets_case_channel_unique" ON macula.generated_assets ("caseId", "channelKey");
