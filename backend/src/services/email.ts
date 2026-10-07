import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq, and } from "drizzle-orm";

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = process.env.SMTP_SECURE === "true";
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER || "no-reply@insightb2b.cl";

let transporter: Transporter | null = null;

export function isEmailConfigured(): boolean {
  return !!SMTP_HOST;
}

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

export interface EmailParams {
  to: string[];
  subject: string;
  text: string;
}

export async function sendEmail(params: EmailParams): Promise<void> {
  if (!isEmailConfigured() || params.to.length === 0) {
    if (!isEmailConfigured()) {
      console.log(`[email] SMTP no configurado, se omite: ${params.subject}`);
    }
    return;
  }

  try {
    await getTransporter().sendMail({
      from: SMTP_FROM,
      to: params.to.join(", "),
      subject: params.subject,
      text: params.text,
    });
  } catch (error) {
    console.error("[email] error al enviar:", error);
  }
}

export async function sendCompanyEmail(companyId: number, subject: string, text: string): Promise<void> {
  if (!isEmailConfigured()) {
    console.log(`[email] SMTP no configurado, se omite: ${subject}`);
    return;
  }

  const rows = await db
    .select({ email: users.email, active: users.active })
    .from(users)
    .where(and(eq(users.companyId, companyId), eq(users.active, true)));

  const emails = rows
    .map((r) => r.email)
    .filter((e): e is string => !!e && e.includes("@"));

  if (emails.length === 0) return;

  await sendEmail({ to: emails, subject, text });
}

/** Envía el aviso a los usuarios activos de un comprador. */
export async function sendCustomerEmail(customerId: number, subject: string, text: string): Promise<void> {
  if (!isEmailConfigured()) {
    console.log(`[email] SMTP no configurado, se omite: ${subject}`);
    return;
  }

  const rows = await db
    .select({ email: users.email, active: users.active })
    .from(users)
    .where(and(eq(users.customerId, customerId), eq(users.active, true)));

  const emails = rows
    .map((r) => r.email)
    .filter((e): e is string => !!e && e.includes("@"));

  if (emails.length === 0) return;

  await sendEmail({ to: emails, subject, text });
}
