BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '2min';

DO $$
DECLARE
  old_name text;
  new_name text;
  table_names text[] := ARRAY[
    'macula_ai_prompt_definitions',
    'macula_ai_prompt_templates',
    'macula_ai_usage_logs',
    'macula_asset_versions',
    'macula_audio_recordings',
    'macula_audit_logs',
    'macula_case_sources',
    'macula_case_versions',
    'macula_cases',
    'macula_channel_definitions',
    'macula_compliance_rules',
    'macula_departments',
    'macula_generated_assets',
    'macula_image_assets',
    'macula_image_generation_jobs',
    'macula_organizations',
    'macula_permissions',
    'macula_plans',
    'macula_platform_limits',
    'macula_platform_templates',
    'macula_publication_connections',
    'macula_publication_jobs',
    'macula_role_definition_permissions',
    'macula_role_definitions',
    'macula_role_permissions',
    'macula_roles',
    'macula_safety_flags',
    'macula_seo_keyword_sets',
    'macula_sessions',
    'macula_specialties',
    'macula_subscriptions',
    'macula_task_definitions',
    'macula_users'
  ];
BEGIN
  FOREACH old_name IN ARRAY table_names LOOP
    new_name := regexp_replace(old_name, '^macula_', '');

    IF to_regclass(format('%I.%I', 'macula', new_name)) IS NOT NULL THEN
      RAISE EXCEPTION 'Target relation macula.% already exists', new_name;
    END IF;

    IF to_regclass(format('%I.%I', 'macula', old_name)) IS NULL THEN
      RAISE EXCEPTION 'Source table macula.% does not exist', old_name;
    END IF;

    EXECUTE format('ALTER TABLE %I.%I RENAME TO %I', 'macula', old_name, new_name);
  END LOOP;

  FOREACH old_name IN ARRAY table_names LOOP
    new_name := regexp_replace(old_name, '^macula_', '');
    EXECUTE format('CREATE VIEW %I.%I AS SELECT * FROM %I.%I', 'macula', old_name, 'macula', new_name);
  END LOOP;
END $$;

COMMIT;
