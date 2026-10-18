import { eq, sql } from 'drizzle-orm';
import { db, pool, type Tx } from './client.js';
import {
  activities, assignmentRules, companies, contactTags, contacts, customFields, memberships, opportunities, pipelines, rolePermissions, roles, stageRequiredFields, stages, tags, users, workspaces,
} from './schema/index.js';
import { env } from '../env.js';
import { hashPassword } from '../auth/password.js';
import { createWorkspace, addMember, createPipelineWithStages } from '../../modules/workspace/service.js';

// Deterministic generator so reruns on a fresh database produce the same demo data.
let seedState = 20260418;
const rnd = () => ((seedState = (seedState * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]!;
const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
const daysAgo = (d: number) => new Date(Date.now() - d * 86400_000 - int(0, 86400) * 1000);

const FIRST = ['Ali', 'Ahmed', 'Hassan', 'Hussain', 'Usman', 'Bilal', 'Faisal', 'Imran', 'Kamran', 'Omar', 'Tariq', 'Zeeshan', 'Asad', 'Danish', 'Farhan', 'Hamza', 'Junaid', 'Rizwan', 'Shahid', 'Waqas', 'Ayesha', 'Fatima', 'Hira', 'Maryam', 'Sana', 'Zainab', 'Nida', 'Amna', 'Saima', 'Rabia', 'Mehwish', 'Iqra', 'Bushra', 'Samina', 'Noor'];
const LAST = ['Khan', 'Malik', 'Chaudhry', 'Qureshi', 'Siddiqui', 'Sheikh', 'Butt', 'Raza', 'Abbasi', 'Awan', 'Mirza', 'Hashmi', 'Gillani', 'Niazi', 'Bhatti', 'Rana', 'Javed', 'Ansari', 'Cheema', 'Baig', 'Durrani', 'Yousafzai', 'Rehman', 'Farooqi'];
const AREAS = ['F-7', 'E-11', 'G-13', 'DHA Phase 2', 'Bahria Town'] as const;
const TAGS = ['Hot', 'Investor', 'Overseas', 'Renter', 'VIP'];
const COMPANIES = ['Capital Traders Pvt Ltd', 'Blue Area Holdings', 'Margalla Builders', 'Pindi Logistics', 'Sitara Textiles', 'Kohistan Foods', 'Rawal Engineering', 'Zia Associates', 'Metro Pharma', 'Orbit Systems', 'Green Valley Farms', 'Saffron Interiors', 'Indus Consultants', 'Taxila Steel', 'Crescent Medical', 'Elite Auto Traders', 'Hilltop Developers', 'Najam Brothers', 'Fine Cut Salon', 'Cedar Education Group', 'Islamabad Imports', 'Nawaz & Sons', 'Ravi Garments', 'Skyline Travels', 'Apex Dental'];

const PERM_SALES_MANAGER = ['crm.view', 'crm.create', 'crm.edit', 'crm.delete', 'crm.export', 'crm.view_values', 'leads.reassign', 'leads.manage_rules', 'audit.view'];

async function ensureUser(tx: Tx, name: string, email: string, passwordHash: string) {
  const [ex] = await tx.select().from(users).where(eq(users.email, email));
  if (ex) return ex;
  const [u] = await tx.insert(users).values({ name, email, passwordHash }).returning();
  return u!;
}

const phones = new Set<string>();
function phone() {
  for (;;) {
    const p = `+92${pick(['300', '301', '321', '333', '345', '312', '313'])}${String(int(1000000, 9999999))}`;
    if (!phones.has(p)) {
      phones.add(p);
      return p;
    }
  }
}

async function chunked<T>(rows: T[], size: number, fn: (c: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

async function seedMargalla(passwordHash: string) {
  await db.transaction(async (tx) => {
    const { workspace, roles: base } = await createWorkspace(tx, { name: 'Margalla Estates', slug: 'margalla-estates', timezone: 'Asia/Karachi', currency: 'PKR' });
    const ws = workspace.id;

    const [mgr] = await tx.insert(roles).values({ workspaceId: ws, name: 'Sales Manager', baseLevel: 'user' }).returning();
    await tx.insert(rolePermissions).values(PERM_SALES_MANAGER.map((permission) => ({ roleId: mgr!.id, workspaceId: ws, permission })));

    const team = [
      { name: 'Saad Hayat', email: 'saad@margallaestates.pk', role: base.owner.id },
      { name: 'Abdullah Khan', email: 'abdullah@margallaestates.pk', role: base.admin.id },
      { name: 'Ahmad Mustafa', email: 'ahmad@margallaestates.pk', role: base.user.id },
      { name: 'Hira Malik', email: 'hira@margallaestates.pk', role: mgr!.id },
      { name: 'Bilal Chaudhry', email: 'bilal@margallaestates.pk', role: base.user.id },
      { name: 'Ayesha Siddiqui', email: 'ayesha@margallaestates.pk', role: base.user.id },
      { name: 'Usman Qureshi', email: 'usman@margallaestates.pk', role: base.user.id },
    ];
    const members: Record<string, string> = {};
    for (const t of team) {
      const u = await ensureUser(tx, t.name, t.email, passwordHash);
      await addMember(tx, ws, u.id, t.role);
      members[t.email.split('@')[0]!] = u.id;
    }
    await tx.update(memberships).set({ availability: 'busy' }).where(eq(memberships.userId, members.bilal!));
    const staff = ['ahmad', 'hira', 'bilal', 'ayesha', 'usman'].map((k) => members[k]!);

    // Residential Sales: reuse the default pipeline created with the workspace, then reshape its stages.
    const [defPipe] = await tx.select().from(pipelines).where(eq(pipelines.workspaceId, ws));
    await tx.delete(stages).where(eq(stages.pipelineId, defPipe!.id));
    await tx.update(pipelines).set({ name: 'Residential Sales' }).where(eq(pipelines.id, defPipe!.id));
    const resStages = await tx
      .insert(stages)
      .values(['New Inquiry', 'Site Visit', 'Negotiation', 'Booking', 'Won', 'Lost'].map((name, i) => ({ workspaceId: ws, pipelineId: defPipe!.id, name, position: i, isWon: name === 'Won', isLost: name === 'Lost' })))
      .returning();
    const { pipeline: rentals, stages: rentStages } = await createPipelineWithStages(tx, ws, 'Rentals', false, [
      { name: 'Inquiry', isWon: false, isLost: false },
      { name: 'Viewing', isWon: false, isLost: false },
      { name: 'Agreement', isWon: false, isLost: false },
      { name: 'Rented', isWon: true, isLost: false },
      { name: 'Lost', isWon: false, isLost: true },
    ]);

    const f = async (v: typeof customFields.$inferInsert) => (await tx.insert(customFields).values(v).returning())[0]!;
    const propType = await f({ workspaceId: ws, entity: 'opportunity', pipelineId: defPipe!.id, name: 'Property Type', type: 'dropdown', options: ['House', 'Apartment', 'Plot', 'Commercial'], position: 0 });
    const budget = await f({ workspaceId: ws, entity: 'opportunity', pipelineId: defPipe!.id, name: 'Budget (PKR)', type: 'number', position: 1 });
    const area = await f({ workspaceId: ws, entity: 'opportunity', pipelineId: defPipe!.id, name: 'Preferred Area', type: 'dropdown', options: [...AREAS], position: 2 });
    const unit = await f({ workspaceId: ws, entity: 'opportunity', pipelineId: defPipe!.id, name: 'Plot or Unit Number', type: 'text', position: 3 });
    const rentBudget = await f({ workspaceId: ws, entity: 'opportunity', pipelineId: rentals.id, name: 'Monthly Rent Budget', type: 'number', position: 0 });
    const beds = await f({ workspaceId: ws, entity: 'opportunity', pipelineId: rentals.id, name: 'Bedrooms', type: 'number', position: 1 });
    const moveIn = await f({ workspaceId: ws, entity: 'opportunity', pipelineId: rentals.id, name: 'Move-in Date', type: 'date', position: 2 });
    await f({ workspaceId: ws, entity: 'opportunity', pipelineId: rentals.id, name: 'Furnished', type: 'checkbox', position: 3 });
    await f({ workspaceId: ws, entity: 'contact', pipelineId: null, name: 'Preferred Language', type: 'dropdown', options: ['Urdu', 'English', 'Punjabi'], position: 0 });
    const cnic = await f({ workspaceId: ws, entity: 'contact', pipelineId: null, name: 'CNIC Verified', type: 'checkbox', position: 1 });

    const booking = resStages.find((s) => s.name === 'Booking')!;
    await tx.insert(stageRequiredFields).values([
      { workspaceId: ws, stageId: booking.id, fieldId: unit.id },
      { workspaceId: ws, stageId: booking.id, fieldId: propType.id },
      { workspaceId: ws, stageId: rentStages.find((s) => s.name === 'Agreement')!.id, fieldId: moveIn.id },
    ]);

    const tagRows = await tx.insert(tags).values(TAGS.map((name) => ({ workspaceId: ws, name }))).returning();

    await tx
      .update(assignmentRules)
      .set({
        ackWindowSeconds: 120,
        maxOpenLeads: 15,
        idleSeconds: 3600,
        escalationLevels: [
          { kind: 'next_eligible', seconds: 120 },
          { kind: 'backup', userId: members.abdullah, seconds: 120 },
          { kind: 'manager', userId: members.hira, seconds: 180 },
        ],
      })
      .where(eq(assignmentRules.workspaceId, ws));

    const companyRows = await tx.insert(companies).values(COMPANIES.map((name) => ({ workspaceId: ws, name, domain: `${name.toLowerCase().replace(/[^a-z]+/g, '')}.pk`, createdAt: daysAgo(int(10, 90)) }))).returning();

    const contactValues = Array.from({ length: 300 }, (_, i) => {
      const first = pick(FIRST);
      const last = pick(LAST);
      return {
        workspaceId: ws,
        name: `${first} ${last}`,
        phone: phone(),
        email: rnd() < 0.55 ? `${first}.${last}${int(1, 99)}@${pick(['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com'])}`.toLowerCase() : null,
        companyId: rnd() < 0.2 ? pick(companyRows).id : null,
        ownerId: pick(staff),
        custom: { [cnic.id]: rnd() < 0.4 },
        createdAt: daysAgo(int(0, 60)),
      };
    });
    const contactRows: Array<{ id: string }> = [];
    await chunked(contactValues, 100, async (c) => contactRows.push(...(await tx.insert(contacts).values(c).returning({ id: contacts.id }))));

    await chunked(
      contactRows.flatMap((c) => (rnd() < 0.45 ? [{ workspaceId: ws, contactId: c.id, tagId: pick(tagRows).id }] : [])),
      200,
      (c) => tx.insert(contactTags).values(c).onConflictDoNothing(),
    );

    const oppValues = contactRows.slice(0, 230).map((c, i) => {
      const rent = i % 4 === 3;
      const stageList = rent ? rentStages : resStages;
      const stage = pick(stageList);
      const custom: Record<string, unknown> = rent
        ? { [rentBudget.id]: int(5, 40) * 10000, [beds.id]: int(1, 5) }
        : { [propType.id]: pick(['House', 'Apartment', 'Plot', 'Commercial']), [budget.id]: int(50, 1500) * 100000, [area.id]: pick(AREAS) };
      if (!rent && ['Booking', 'Won'].includes(stage.name)) custom[unit.id] = `${pick(['A', 'B', 'C'])}-${int(10, 480)}`;
      if (rent && ['Agreement', 'Rented'].includes(stage.name)) custom[moveIn.id] = new Date(Date.now() + int(5, 45) * 86400_000).toISOString().slice(0, 10);
      const valuePkr = rent ? int(5, 40) * 10000 : int(50, 1500) * 100000;
      return {
        workspaceId: ws,
        pipelineId: rent ? rentals.id : defPipe!.id,
        stageId: stage.id,
        contactId: c.id,
        ownerId: pick(staff),
        name: rent ? `Rental, ${pick(AREAS)}` : `${pick(['Plot', 'House', 'Apartment', 'Office'])} enquiry, ${pick(AREAS)}`,
        valueCents: valuePkr * 100,
        currency: 'PKR',
        custom,
        createdAt: daysAgo(int(0, 55)),
      };
    });
    await chunked(oppValues, 100, (c) => tx.insert(opportunities).values(c));

    await chunked(
      contactRows.slice(0, 40).map((c) => ({ workspaceId: ws, contactId: c.id, type: 'note' as const, actorId: pick(staff), data: { body: pick(['Asked for brochure and payment plan.', 'Prefers site visit on weekend.', 'Budget flexible for the right location.', 'Will confirm with family and call back.']) }, createdAt: daysAgo(int(0, 20)) })),
      100,
      (c) => tx.insert(activities).values(c),
    );
  });
}

async function seedKohsar(passwordHash: string) {
  await db.transaction(async (tx) => {
    const { workspace, roles: base } = await createWorkspace(tx, { name: 'Kohsar Solar', slug: 'kohsar-solar', timezone: 'Asia/Karachi', currency: 'PKR' });
    const ws = workspace.id;
    const people = [
      { name: 'Sana Ahmed', email: 'sana@kohsarsolar.pk', role: base.owner.id },
      { name: 'Raheel Anwar', email: 'raheel@kohsarsolar.pk', role: base.admin.id },
      { name: 'Mahnoor Iqbal', email: 'mahnoor@kohsarsolar.pk', role: base.user.id },
    ];
    const ids: string[] = [];
    for (const p of people) {
      const u = await ensureUser(tx, p.name, p.email, passwordHash);
      await addMember(tx, ws, u.id, p.role);
      ids.push(u.id);
    }
    const [pipe] = await tx.select().from(pipelines).where(eq(pipelines.workspaceId, ws));
    await tx.update(pipelines).set({ name: 'Solar Installations' }).where(eq(pipelines.id, pipe!.id));
    const st = await tx.select().from(stages).where(eq(stages.pipelineId, pipe!.id));
    const cs = await tx
      .insert(contacts)
      .values(Array.from({ length: 24 }, () => ({ workspaceId: ws, name: `${pick(FIRST)} ${pick(LAST)}`, phone: phone(), ownerId: pick(ids), createdAt: daysAgo(int(0, 30)) })))
      .returning({ id: contacts.id });
    await tx.insert(opportunities).values(cs.slice(0, 14).map((c) => ({ workspaceId: ws, pipelineId: pipe!.id, stageId: pick(st).id, contactId: c.id, ownerId: pick(ids), name: `${pick([3, 5, 8, 10])} kW system`, valueCents: int(8, 45) * 100000 * 100, currency: 'PKR' })));
  });
}

async function main() {
  if (!env.SEED_PASSWORD) throw new Error('SEED_PASSWORD is required to seed');
  const passwordHash = await hashPassword(env.SEED_PASSWORD);
  for (const [slug, fn] of [['margalla-estates', seedMargalla], ['kohsar-solar', seedKohsar]] as const) {
    const [ex] = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.slug, slug));
    if (ex) {
      console.log(`seed: ${slug} already exists, skipping`);
      continue;
    }
    await fn(passwordHash);
    console.log(`seed: created ${slug}`);
  }
  const [{ n }] = (await db.select({ n: sql<number>`count(*)::int` }).from(contacts)) as [{ n: number }];
  console.log(`seed: ${n} contacts in database`);
}

main()
  .catch((e) => {
    console.error('seed failed:', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
