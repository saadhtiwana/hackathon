import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../app.js';
import { env } from '../core/env.js';

export const app = createApp();
export const origin = env.allowedOrigins[0]!;
export const PASSWORD = 'correct-horse-9';

export const uniq = () => randomUUID().slice(0, 8);

export type Agent = ReturnType<typeof request.agent>;

export function newAgent(): Agent {
  const a = request.agent(app);
  return a;
}

export const post = (a: Agent, url: string, body?: object) => a.post(url).set('Origin', origin).send(body);
export const patch = (a: Agent, url: string, body?: object) => a.patch(url).set('Origin', origin).send(body);
export const put = (a: Agent, url: string, body?: object) => a.put(url).set('Origin', origin).send(body);
export const del = (a: Agent, url: string) => a.delete(url).set('Origin', origin);

export async function signupOwner() {
  const agent = newAgent();
  const email = `owner-${uniq()}@test.example`;
  const r = await post(agent, '/api/auth/signup', { workspaceName: `Test ${uniq()}`, name: 'Owner Test', email, password: PASSWORD });
  if (r.status !== 201) throw new Error(`signup failed: ${r.status} ${JSON.stringify(r.body)}`);
  return { agent, email, userId: r.body.user.id as string, workspaceId: r.body.workspace.id as string };
}

// Invites a member with the named role and returns a logged-in agent for them.
export async function addMemberAs(owner: Awaited<ReturnType<typeof signupOwner>>, roleName: string) {
  const roles = await owner.agent.get('/api/roles');
  const role = (roles.body.items as Array<{ id: string; name: string }>).find((r) => r.name === roleName);
  if (!role) throw new Error(`role ${roleName} not found`);
  const email = `${roleName.toLowerCase()}-${uniq()}@test.example`;
  const inv = await post(owner.agent, '/api/users/invites', { email, roleId: role.id });
  const token = new URL(inv.body.inviteUrl).searchParams.get('token')!;
  const agent = newAgent();
  const acc = await post(agent, '/api/auth/accept-invite', { token, name: `${roleName} Test`, password: PASSWORD });
  if (acc.status !== 201) throw new Error(`accept failed: ${acc.status} ${JSON.stringify(acc.body)}`);
  return { agent, email, userId: acc.body.user.id as string };
}

export async function defaultPipeline(a: Agent) {
  const r = await a.get('/api/pipelines');
  const p = r.body.items[0];
  return { pipelineId: p.id as string, stages: p.stages as Array<{ id: string; name: string }> };
}
