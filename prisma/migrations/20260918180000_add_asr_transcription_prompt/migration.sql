INSERT INTO "macula"."ai_prompt_definitions" ("id", "promptKey", "name", "description", "isSystem")
VALUES ('system-asr-transcription', 'ASR_TRANSCRIPTION', 'ASR Speech-to-Text', 'Controls Stage 1 medical speech transcription guidance for supported ASR providers.', TRUE)
ON CONFLICT ("promptKey") DO UPDATE SET "name"=EXCLUDED."name", "description"=EXCLUDED."description";

INSERT INTO "macula"."ai_prompt_templates" ("id", "promptKey", "definitionId", "content", "version", "isActive", "organizationId")
VALUES ('system-asr-transcription-v1', 'ASR_TRANSCRIPTION', (SELECT "id" FROM "macula"."ai_prompt_definitions" WHERE "promptKey"='ASR_TRANSCRIPTION' LIMIT 1), 'Clinical medical dictation from a licensed practitioner. Preserve exact wording, medication names, dosages, units, anatomy, abbreviations, and procedures. Do not summarize, infer, diagnose, or add information.', 1, TRUE, NULL)
ON CONFLICT DO NOTHING;