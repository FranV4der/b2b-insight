import { db } from "../db/index.js";
import { notifications, users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { sendCompanyEmail, sendCustomerEmail } from "./email.js";

export interface NotifyParams {
  companyId: number;
  title: string;
  message: string;
  type?: string;
  referenceId?: number;
  referenceType?: string;
}

export interface NotifyCustomerParams {
  customerId: number;
  title: string;
  message: string;
  type?: string;
  referenceId?: number;
  referenceType?: string;
}

async function insertForUsers(
  userIds: number[],
  params: { title: string; message: string; type?: string; referenceId?: number; referenceType?: string }
): Promise<void> {
  if (userIds.length === 0) return;
  await db.insert(notifications).values(
    userIds.map((userId) => ({
      userId,
      title: params.title,
      message: params.message,
      type: params.type ?? "order",
      referenceId: params.referenceId ?? null,
      referenceType: params.referenceType ?? null,
    }))
  );
}

export async function notifyCompanyUsers(params: NotifyParams): Promise<void> {
  const userRows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.companyId, params.companyId));

  await insertForUsers(
    userRows.map((u) => u.id),
    params
  );

  await sendCompanyEmail(params.companyId, params.title, params.message);
}

/** Notifica a los usuarios de un comprador (persona natural u organización). */
export async function notifyCustomerUsers(params: NotifyCustomerParams): Promise<void> {
  const userRows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.customerId, params.customerId));

  await insertForUsers(
    userRows.map((u) => u.id),
    params
  );

  await sendCustomerEmail(params.customerId, params.title, params.message);
}
