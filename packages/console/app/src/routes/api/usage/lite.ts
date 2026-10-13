import type { APIEvent } from "@solidjs/start/server"
import { Database, eq, and, isNull, sql } from "@opencode-ai/console-core/drizzle/index.js"
import { BillingTable, LiteTable } from "@opencode-ai/console-core/schema/billing.sql.js"
import { KeyTable } from "@opencode-ai/console-core/schema/key.sql.js"
import { WorkspaceTable } from "@opencode-ai/console-core/schema/workspace.sql.js"
import { UserTable } from "@opencode-ai/console-core/schema/user.sql.js"
import { Subscription } from "@opencode-ai/console-core/subscription.js"
import { LiteData } from "@opencode-ai/console-core/lite.js"

export async function GET(event: APIEvent) {
  const header = event.request.headers.get("authorization") ?? ""
  const zenApiKey = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined
  if (!zenApiKey) return Response.json({ error: "missing api key" }, { status: 401 })

  try {
    const data = await Database.use((tx) =>
      tx
        .select({
          workspaceID: WorkspaceTable.id,
          lite: {
            rollingUsage: LiteTable.rollingUsage,
            weeklyUsage: LiteTable.weeklyUsage,
            monthlyUsage: LiteTable.monthlyUsage,
            timeRollingUpdated: LiteTable.timeRollingUpdated,
            timeWeeklyUpdated: LiteTable.timeWeeklyUpdated,
            timeMonthlyUpdated: LiteTable.timeMonthlyUpdated,
            timeCreated: LiteTable.timeCreated,
          },
        })
        .from(KeyTable)
        .innerJoin(WorkspaceTable, eq(WorkspaceTable.id, KeyTable.workspaceID))
        .innerJoin(BillingTable, eq(BillingTable.workspaceID, KeyTable.workspaceID))
        .innerJoin(UserTable, and(eq(UserTable.workspaceID, KeyTable.workspaceID), eq(UserTable.id, KeyTable.userID)))
        .leftJoin(
          LiteTable,
          and(
            eq(LiteTable.workspaceID, KeyTable.workspaceID),
            eq(LiteTable.userID, KeyTable.userID),
            isNull(LiteTable.timeDeleted),
          ),
        )
        .where(and(eq(KeyTable.key, zenApiKey), isNull(KeyTable.timeDeleted)))
        .then((rows) => rows[0]),
    )

    if (!data) return Response.json({ error: "invalid api key" }, { status: 401 })

    const limits = LiteData.getLimits()
    const sub = data.lite

    const rolling = sub?.rollingUsage !== undefined && sub.timeRollingUpdated
      ? Subscription.analyzeRollingUsage({ limit: limits.rollingLimit, window: limits.rollingWindow, usage: sub.rollingUsage, timeUpdated: sub.timeRollingUpdated })
      : { status: "ok" as const, usagePercent: 0, resetInSec: 0 }

    const weekly = sub?.weeklyUsage !== undefined && sub.timeWeeklyUpdated
      ? Subscription.analyzeWeeklyUsage({ limit: limits.weeklyLimit, usage: sub.weeklyUsage, timeUpdated: sub.timeWeeklyUpdated })
      : { status: "ok" as const, usagePercent: 0, resetInSec: 0 }

    const monthly = sub?.monthlyUsage !== undefined && sub.timeMonthlyUpdated
      ? Subscription.analyzeMonthlyUsage({ limit: limits.monthlyLimit, usage: sub.monthlyUsage, timeUpdated: sub.timeMonthlyUpdated, timeSubscribed: sub.timeCreated })
      : { status: "ok" as const, usagePercent: 0, resetInSec: 0 }

    return Response.json({ rolling, weekly, monthly }, { status: 200 })
  } catch (error) {
    console.error("Failed to fetch lite usage:", error)
    return Response.json({ error: "internal server error" }, { status: 500 })
  }
}
