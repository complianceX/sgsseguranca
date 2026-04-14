-- Phase 4 / P2 - identity hardening
-- Report users whose local/shadow password hash is not on argon2id yet.
-- Execute with a read-only service role in production and export the result
-- before enforcing the final cutover checklist.

WITH password_inventory AS (
  SELECT
    u.id,
    u.company_id,
    u.email,
    u.cpf,
    u.auth_user_id,
    u.status,
    u.deleted_at,
    CASE
      WHEN u.password IS NULL OR btrim(u.password) = '' THEN 'missing'
      WHEN u.password LIKE '$argon2id$%' THEN 'argon2id'
      WHEN u.password LIKE '$2a$%' OR u.password LIKE '$2b$%' OR u.password LIKE '$2y$%' THEN 'bcrypt_legacy'
      ELSE 'unknown_legacy'
    END AS password_state
  FROM users u
)
SELECT
  id,
  company_id,
  email,
  cpf,
  auth_user_id,
  status,
  deleted_at,
  password_state
FROM password_inventory
WHERE password_state <> 'argon2id'
ORDER BY
  CASE password_state
    WHEN 'unknown_legacy' THEN 0
    WHEN 'bcrypt_legacy' THEN 1
    WHEN 'missing' THEN 2
    ELSE 3
  END,
  company_id,
  id;

-- Summary by state:
SELECT
  password_state,
  count(*) AS users
FROM (
  SELECT
    CASE
      WHEN u.password IS NULL OR btrim(u.password) = '' THEN 'missing'
      WHEN u.password LIKE '$argon2id$%' THEN 'argon2id'
      WHEN u.password LIKE '$2a$%' OR u.password LIKE '$2b$%' OR u.password LIKE '$2y$%' THEN 'bcrypt_legacy'
      ELSE 'unknown_legacy'
    END AS password_state
  FROM users u
) inventory
GROUP BY password_state
ORDER BY password_state;
