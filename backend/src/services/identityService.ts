import { supabase } from '../db/client';
import { isUuid } from '../utils/ids';

export const DEFAULT_ORG_NAME = 'Personal';

type OrgResolutionError = 'lookup' | 'insert' | 'update' | 'not_found';
type UserResolutionError =
  | 'lookup'
  | 'insert'
  | 'update'
  | 'missing_email'
  | 'not_found'
  | 'org_mismatch';

export async function ensureOrganization({
  orgId,
  orgName,
  createIfMissing = false,
}: {
  orgId: string;
  orgName?: string;
  createIfMissing?: boolean;
}): Promise<{ orgId: string | null; error?: OrgResolutionError }> {
  const trimmedName = orgName?.trim();

  if (isUuid(orgId)) {
    const { data: orgRow, error: orgLookupErr } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('id', orgId)
      .maybeSingle();

    if (orgLookupErr) {
      console.error('[identity] Failed to lookup org by id', orgLookupErr);
      return { orgId: null, error: 'lookup' };
    }
    if (!orgRow?.id) return { orgId: null, error: 'not_found' };

    if (trimmedName && orgRow.name !== trimmedName) {
      const { error: orgUpdateErr } = await supabase
        .from('organizations')
        .update({ name: trimmedName, updated_at: new Date().toISOString() })
        .eq('id', orgRow.id);
      if (orgUpdateErr) {
        console.error('[identity] Failed to update org name', orgUpdateErr);
        return { orgId: null, error: 'update' };
      }
    }

    return { orgId: orgRow.id as string };
  }

  const { data: orgRow, error: orgLookupErr } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('clerk_id', orgId)
    .maybeSingle();

  if (orgLookupErr) {
    console.error('[identity] Failed to lookup org by clerk_id', orgLookupErr);
    return { orgId: null, error: 'lookup' };
  }
  if (orgRow?.id) {
    if (trimmedName && orgRow.name !== trimmedName) {
      const { error: orgUpdateErr } = await supabase
        .from('organizations')
        .update({ name: trimmedName, updated_at: new Date().toISOString() })
        .eq('id', orgRow.id);
      if (orgUpdateErr) {
        console.error('[identity] Failed to update org name', orgUpdateErr);
        return { orgId: null, error: 'update' };
      }
    }
    return { orgId: orgRow.id as string };
  }
  if (!createIfMissing) return { orgId: null, error: 'not_found' };

  const name = trimmedName || DEFAULT_ORG_NAME;
  const { data: newOrg, error: orgInsertErr } = await supabase
    .from('organizations')
    .insert({ name, clerk_id: orgId })
    .select('id')
    .single();

  if (orgInsertErr) {
    if (orgInsertErr.code === '23505') {
      const { data: existingOrg, error: existingErr } = await supabase
        .from('organizations')
        .select('id')
        .eq('clerk_id', orgId)
        .maybeSingle();
      if (existingErr) {
        console.error('[identity] Failed to re-fetch org after conflict', existingErr);
        return { orgId: null, error: 'insert' };
      }
      if (existingOrg?.id) return { orgId: existingOrg.id as string };
    }
    console.error('[identity] Failed to create org', orgInsertErr);
    return { orgId: null, error: 'insert' };
  }
  if (!newOrg) {
    console.error('[identity] Failed to create org: no data returned');
    return { orgId: null, error: 'insert' };
  }
  return { orgId: newOrg.id as string };
}

export async function ensureUser({
  userId,
  orgId,
  userEmail,
  userName,
  createIfMissing = false,
}: {
  userId: string;
  orgId: string;
  userEmail?: string;
  userName?: string;
  createIfMissing?: boolean;
}): Promise<{ userId: string | null; error?: UserResolutionError }> {
  const trimmedEmail = userEmail?.trim();
  const trimmedName = userName?.trim();

  const { data: userRow, error: userLookupErr } = await supabase
    .from('users')
    .select('id, org_id, email, name')
    .eq('clerk_id', userId)
    .maybeSingle();

  if (userLookupErr) {
    console.error('[identity] Failed to lookup user', userLookupErr);
    return { userId: null, error: 'lookup' };
  }

  if (userRow?.id) {
    if (orgId && userRow.org_id !== orgId) {
      console.warn('[identity] User org mismatch', { userId, orgId, existingOrgId: userRow.org_id });
      return { userId: null, error: 'org_mismatch' };
    }

    const updates: Record<string, string | null> = {};
    if (trimmedEmail && userRow.email !== trimmedEmail) updates.email = trimmedEmail;
    if (trimmedName && userRow.name !== trimmedName) updates.name = trimmedName;

    if (Object.keys(updates).length > 0) {
      const { error: userUpdateErr } = await supabase.from('users').update(updates).eq('id', userRow.id);
      if (userUpdateErr) {
        console.error('[identity] Failed to update user', userUpdateErr);
        return { userId: null, error: 'update' };
      }
    }

    return { userId: userRow.id as string };
  }

  if (!createIfMissing) return { userId: null, error: 'not_found' };
  if (!trimmedEmail) return { userId: null, error: 'missing_email' };

  const { data: newUser, error: userInsertErr } = await supabase
    .from('users')
    .insert({
      org_id: orgId,
      clerk_id: userId,
      email: trimmedEmail,
      name: trimmedName ?? null,
    })
    .select('id')
    .single();

  if (userInsertErr) {
    if (userInsertErr.code === '23505') {
      const { data: existingUser, error: existingErr } = await supabase
        .from('users')
        .select('id')
        .eq('clerk_id', userId)
        .maybeSingle();
      if (existingErr) {
        console.error('[identity] Failed to re-fetch user after conflict', existingErr);
        return { userId: null, error: 'insert' };
      }
      if (existingUser?.id) return { userId: existingUser.id as string };
    }
    console.error('[identity] Failed to create user', userInsertErr);
    return { userId: null, error: 'insert' };
  }
  if (!newUser) {
    console.error('[identity] Failed to create user: no data returned');
    return { userId: null, error: 'insert' };
  }
  return { userId: newUser.id as string };
}
