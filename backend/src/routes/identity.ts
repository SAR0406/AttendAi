import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ensureOrganization, ensureUser } from '../services/identityService';

const SyncIdentitySchema = z.object({
  orgId: z.string().min(1),
  orgName: z.string().min(1).max(255).optional(),
  userId: z.string().min(1),
  userEmail: z.string().email().optional(),
  userName: z.string().min(1).max(255).optional(),
});

export const identityRouter: FastifyPluginAsync = async (app) => {
  app.post('/', async (req, reply) => {
    const parsed = SyncIdentitySchema.safeParse(req.body);
    if (!parsed.success) {
      const message = parsed.error.issues
        .map((issue) => (issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message))
        .join('; ');
      return reply.status(400).send({ error: message });
    }

    const { orgId, orgName, userId, userEmail, userName } = parsed.data;

    const { orgId: resolvedOrgId, error: orgError } = await ensureOrganization({
      orgId,
      orgName,
      createIfMissing: true,
    });
    if (!resolvedOrgId) {
      return reply.status(500).send({
        error: orgError === 'not_found' ? 'Organization not found' : 'Unable to sync organization',
      });
    }

    const { userId: resolvedUserId, error: userError } = await ensureUser({
      userId,
      orgId: resolvedOrgId,
      userEmail,
      userName,
      createIfMissing: true,
    });
    if (!resolvedUserId) {
      if (userError === 'missing_email') {
        return reply.status(400).send({
          error: 'User not found; include userEmail to auto-create the user record',
        });
      }
      return reply.status(500).send({ error: 'Unable to sync user' });
    }

    return reply.status(200).send({ orgId: resolvedOrgId, userId: resolvedUserId });
  });
};
