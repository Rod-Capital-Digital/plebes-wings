import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../sql/06_MULTIROl_ANULACION_SEGURA_PREPARADA.sql',import.meta.url),'utf8');

test('migración V3 define rutas controladas y revoca escrituras directas',()=>{
  assert.match(sql,/FUNCTION public\.pw_register_sale_v2\(p_request jsonb\)/);
  assert.match(sql,/FUNCTION public\.pw_void_sale_v1\(p_sale_id uuid, p_reason text\)/);
  assert.match(sql,/SECURITY DEFINER[\s\S]*SET search_path = ''/);
  assert.match(sql,/v_role = 'employee' AND v_branch IS DISTINCT FROM v_assigned_branch/);
  assert.match(sql,/FOR UPDATE/);
  assert.match(sql,/BEGIN;[\s\S]*COMMIT;/);
  assert.match(sql,/ADD COLUMN IF NOT EXISTS void_legacy boolean NOT NULL DEFAULT false/);
  assert.match(sql,/UPDATE public\.pw_sales[\s\S]*SET void_legacy = true/);
  assert.match(sql,/v_existing\.created_by IS DISTINCT FROM v_user/);
  assert.match(sql,/private\.pw_is_manager\(\)/);
  assert.doesNotMatch(sql,/FUNCTION private\.pw_member_role/);
  assert.match(sql,/INSERT INTO public\.pw_audit_events/);
  assert.match(sql,/DROP POLICY IF EXISTS pw_sales_update/);
  assert.match(sql,/REVOKE INSERT, UPDATE, DELETE ON public\.pw_sales, public\.pw_sale_lines, public\.pw_sale_payments, public\.pw_audit_events FROM anon, authenticated/);
});

test('migración conserva idempotencia y evita anulación duplicada',()=>{
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(sql,/request_payload IS DISTINCT FROM p_request/);
  assert.match(sql,/v_sale\.status <> 'active'/);
  assert.match(sql,/status='void', void_reason=v_reason, voided_by=v_user, voided_at=now\(\)/);
});
