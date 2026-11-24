import { NextRequest, NextResponse } from "next/server";
import {
  getAssetReliability,
  getKpis,
  getSyncChanges,
  globalSearch,
  markNotificationRead,
  myNotifications,
  portalSummary,
  pushSyncOperations,
  refreshInsights,
  reviewInsight,
  runReport,
  technicianMyWork,
} from "@/server/analytics";
import {
  handleAdminSetPassword,
  handleChangePassword,
  handleExportPersonalData,
  handleForgotPassword,
  handleGetMe,
  handleGetPermissions,
  handleGetTenant,
  handleLogin,
  handleMfaConfirm,
  handleMfaStart,
  handlePreferences,
  handlePseudonymiseUser,
  handleResetMfa,
  handleResetPassword,
  handleRevokeSessions,
  handleUnlockUser,
  handleUpdateTenant,
} from "@/server/auth-handlers";
import {
  createResource,
  exportCsv,
  getResource,
  listResources,
  optionsResources,
  updateResource,
} from "@/server/crud";
import {
  adjustStock,
  approveTimeEntry,
  assetTree,
  availableWorkOrderTransitions,
  calibrationCommand,
  changeAssetSafety,
  changeAssetStatus,
  convertRequisitionToPo,
  downloadDocumentFile,
  generateBillingExport,
  generatePmNow,
  ingestSensorReading,
  issuePassportToken,
  issueReservation,
  permitCommand,
  pmCommand,
  pmForecast,
  postCycleCount,
  publicScanPassport,
  purchaseOrderCommand,
  quoteCommand,
  receiveStock,
  recordWorkTask,
  releaseReservation,
  reopenWorkOrder,
  requeueOutboxEvent,
  requestCommand,
  requisitionCommand,
  reserveStock,
  resolvePassportToken,
  retireAsset,
  returnStock,
  revealWebhookSecret,
  revokePassportToken,
  revokeServiceGrant,
  sensorAlertCommand,
  setBillingStatus,
  stockByWarehouse,
  testIntegration,
  transferAsset,
  transferStock,
  transitionWorkOrder,
  uploadDocumentFile,
  warehouseStock,
  workOrderCosts,
} from "@/server/domains";
import { authenticateAuthorizationHeader, isMfaEnrollmentRequired, requireRole } from "@/server/security";
import { ensureSeeded } from "@/server/seed";
import { addDaysDate, isoDateOnly, runWithPrincipal, tableOf } from "@/server/store";
import { ApiError } from "@/server/types";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ path: string[] }> };

function splitColon(segment: string): { base: string; action: string | null } {
  const idx = segment.indexOf(":");
  if (idx === -1) return { base: segment, action: null };
  return { base: segment.slice(0, idx), action: segment.slice(idx + 1) };
}

function queryRecord(req: NextRequest): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of req.nextUrl.searchParams.entries()) {
    out[k] = v;
  }
  return out;
}

async function readJsonBody(req: NextRequest): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (!text || !text.trim()) return {};
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    throw ApiError.invalid("Request body must be a JSON object");
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw ApiError.invalid("Invalid JSON body");
  }
}

function strParam(body: Record<string, unknown>, key: string): string | null {
  const v = body[key];
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function reqId(body: Record<string, unknown>, key: string): string {
  const v = strParam(body, key);
  if (!v) throw ApiError.invalid(`${key} is required`);
  return v;
}

function numParam(body: Record<string, unknown>, key: string): number | null {
  const s = strParam(body, key);
  if (s === null) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) throw ApiError.invalid(`${key} must be a number`);
  return n;
}

function opKey(body: Record<string, unknown>, req: NextRequest): string | null {
  return strParam(body, "clientOperationId") ?? req.headers.get("Idempotency-Key");
}

function jsonError(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json(
      {
        status: err.status,
        code: err.code,
        detail: err.message,
        ...(err.errors.length ? { errors: err.errors } : {}),
      },
      { status: err.status },
    );
  }
  const message = err instanceof Error ? err.message : "Unexpected error";
  return NextResponse.json(
    {
      status: 500,
      code: "INTERNAL_ERROR",
      detail: message,
    },
    { status: 500 },
  );
}

async function dispatch(req: NextRequest, segments: string[]): Promise<NextResponse> {
  ensureSeeded();

  const method = req.method.toUpperCase();
  const joined = segments.join("/");

  // Public unauthenticated endpoints
  if (method === "POST" && joined === "auth/login") {
    const body = await readJsonBody(req);
    return NextResponse.json(handleLogin(body));
  }
  if (method === "POST" && joined === "auth/forgot-password") {
    const body = await readJsonBody(req);
    return NextResponse.json(handleForgotPassword(body));
  }
  if (method === "POST" && joined === "auth/reset-password") {
    const body = await readJsonBody(req);
    return NextResponse.json(handleResetPassword(body));
  }
  if (method === "GET" && segments.length === 3 && segments[0] === "public" && segments[1] === "passport") {
    return NextResponse.json(publicScanPassport(segments[2]));
  }

  const principal = authenticateAuthorizationHeader(req.headers.get("authorization"));
  if (!principal) {
    throw ApiError.unauthorized();
  }

  // Enforce MFA enrolment policy if enabled
  const mfaExempt =
    joined === "me" ||
    joined === "me:change-password" ||
    joined === "me/mfa:start" ||
    joined === "me/mfa:confirm" ||
    joined.startsWith("auth/");
  if (!mfaExempt && principal.userId) {
    const u = tableOf("users").get(principal.userId);
    if (u && isMfaEnrollmentRequired(u)) {
      throw new ApiError(403, "MFA_ENROLLMENT_REQUIRED", "Multi-factor authentication enrolment is required");
    }
  }

  return await runWithPrincipal(principal, async () => {
    const params = queryRecord(req);

    // ---- Auth / Profile / Tenant
    if (method === "GET" && joined === "me") return NextResponse.json(handleGetMe());
    if (method === "GET" && joined === "me/permissions") return NextResponse.json(handleGetPermissions());
    if (method === "POST" && joined === "me:preferences") return NextResponse.json(handlePreferences(await readJsonBody(req)));
    if (method === "POST" && joined === "me:change-password") return NextResponse.json(handleChangePassword(await readJsonBody(req)));
    if (method === "POST" && joined === "me/mfa:start") return NextResponse.json(handleMfaStart());
    if (method === "POST" && joined === "me/mfa:confirm") return NextResponse.json(handleMfaConfirm(await readJsonBody(req)));
    if (method === "GET" && joined === "tenant") return NextResponse.json(handleGetTenant());
    if (method === "PATCH" && joined === "tenant") return NextResponse.json(handleUpdateTenant(await readJsonBody(req)));

    // ---- Workspace & Sync
    if (method === "GET" && joined === "search") return NextResponse.json(globalSearch(params.q ?? ""));
    if (method === "GET" && joined === "notifications/mine") return NextResponse.json(myNotifications());
    if (method === "GET" && joined === "technician/my-work") return NextResponse.json(technicianMyWork());
    if (method === "GET" && joined === "portal/summary") return NextResponse.json(portalSummary());
    if (method === "POST" && joined === "mobile/sync/operations") {
      return NextResponse.json(pushSyncOperations(await readJsonBody(req)));
    }
    if (method === "GET" && joined === "mobile/sync/changes") {
      return NextResponse.json(getSyncChanges(params.since ?? null));
    }

    // ---- Reliability & Reports
    if (method === "GET" && joined === "kpis") {
      const rawDays = Number.parseInt(params.days ?? "90", 10);
      const days = Math.max(1, Math.min(Number.isNaN(rawDays) ? 90 : rawDays, 730));
      return NextResponse.json(getKpis(days, params.siteId ?? null));
    }
    if (method === "POST" && joined === "ai-insights:refresh") {
      requireRole("MANAGER", "PLANNER");
      return NextResponse.json({ created: refreshInsights(principal.tenantId) });
    }
    if (method === "GET" && segments.length === 2 && segments[0] === "reports") {
      const to = params.to || isoDateOnly();
      const from = params.from || addDaysDate(to, -90);
      return NextResponse.json(runReport(segments[1], from, to));
    }

    // ---- Stock command endpoints
    if (method === "POST" && joined === "stock-receipts") {
      const b = await readJsonBody(req);
      const mv = receiveStock(
        reqId(b, "partId"),
        reqId(b, "warehouseId"),
        numParam(b, "quantity"),
        numParam(b, "unitCost"),
        strParam(b, "reference"),
        opKey(b, req),
      );
      return NextResponse.json(getResource("stock-movements", mv.id));
    }
    if (method === "POST" && joined === "stock-reservations") {
      const b = await readJsonBody(req);
      const r = reserveStock(
        reqId(b, "partId"),
        reqId(b, "warehouseId"),
        reqId(b, "workOrderId"),
        numParam(b, "quantity"),
        opKey(b, req),
      );
      return NextResponse.json(getResource("stock-reservations", r.id));
    }
    if (method === "POST" && joined === "stock-returns") {
      const b = await readJsonBody(req);
      const mv = returnStock(
        reqId(b, "partId"),
        reqId(b, "warehouseId"),
        strParam(b, "workOrderId"),
        numParam(b, "quantity"),
        strParam(b, "reason"),
        opKey(b, req),
      );
      return NextResponse.json(getResource("stock-movements", mv.id));
    }
    if (method === "POST" && joined === "stock-adjustments") {
      const b = await readJsonBody(req);
      const mv = adjustStock(
        reqId(b, "partId"),
        reqId(b, "warehouseId"),
        numParam(b, "quantity"),
        strParam(b, "reason"),
        opKey(b, req),
      );
      return NextResponse.json(getResource("stock-movements", mv.id));
    }
    if (method === "POST" && joined === "stock-transfers") {
      const b = await readJsonBody(req);
      const mvs = transferStock(
        reqId(b, "partId"),
        reqId(b, "fromWarehouseId"),
        reqId(b, "toWarehouseId"),
        numParam(b, "quantity"),
        opKey(b, req),
      );
      return NextResponse.json(mvs.map((m) => getResource("stock-movements", m.id)));
    }

    // ---- Passport resolution (authenticated)
    if (method === "GET" && segments.length === 2 && segments[0] === "passport") {
      const assetId = resolvePassportToken(segments[1]);
      return NextResponse.json(getResource("assets", assetId));
    }

    // ---- 4-segment nested action: /work-orders/{id}/tasks/{taskId}:record
    if (method === "POST" && segments.length === 4 && segments[0] === "work-orders" && segments[2] === "tasks") {
      const { base: taskId, action } = splitColon(segments[3]);
      if (action === "record") {
        const b = await readJsonBody(req);
        const t = recordWorkTask(segments[1], taskId, b);
        return NextResponse.json(getResource("work-tasks", t.id));
      }
    }

    // ---- 3-segment subresource endpoints
    if (segments.length === 3) {
      const [res, id, sub] = segments;
      if (method === "GET" && res === "users" && sub === "personal-data") {
        return NextResponse.json(handleExportPersonalData(id));
      }
      if (method === "GET" && res === "assets" && sub === "tree") {
        return NextResponse.json(assetTree(id));
      }
      if (method === "GET" && res === "assets" && sub === "reliability") {
        return NextResponse.json(getAssetReliability(id));
      }
      if (method === "POST" && res === "assets" && sub === "passport-tokens") {
        return NextResponse.json(getResource("passport-tokens", issuePassportToken(id).id));
      }
      if (method === "GET" && res === "parts" && sub === "stock") {
        return NextResponse.json(stockByWarehouse(id));
      }
      if (method === "GET" && res === "warehouses" && sub === "stock") {
        return NextResponse.json(warehouseStock(id));
      }
      if (method === "GET" && res === "work-orders" && sub === "transitions") {
        return NextResponse.json(availableWorkOrderTransitions(id));
      }
      if (method === "GET" && res === "work-orders" && sub === "costs") {
        return NextResponse.json(workOrderCosts(id));
      }
      if (method === "GET" && res === "pm-plans" && sub === "forecast") {
        const count = Math.min(24, Math.max(1, Number.parseInt(params.count ?? "6", 10) || 6));
        return NextResponse.json(pmForecast(id, count));
      }
      if (method === "POST" && res === "sensors" && sub === "readings") {
        const b = await readJsonBody(req);
        const s = ingestSensorReading(id, numParam(b, "value"));
        return NextResponse.json(getResource("sensors", s.id));
      }
      if (method === "POST" && res === "documents" && sub === "file") {
        const formData = await req.formData();
        const file = formData.get("file");
        if (!file || !(file instanceof Blob)) {
          throw ApiError.invalid("File is required");
        }
        const buf = new Uint8Array(await file.arrayBuffer());
        const fileName = "name" in file && typeof file.name === "string" ? file.name : "file";
        const contentType = file.type || "application/octet-stream";
        const d = uploadDocumentFile(id, buf, fileName, contentType);
        return NextResponse.json(getResource("documents", d.id));
      }
      if (method === "GET" && res === "documents" && sub === "download") {
        const { doc, data } = downloadDocumentFile(id);
        return new NextResponse(Buffer.from(data), {
          status: 200,
          headers: {
            "Content-Type": String(doc.contentType || "application/octet-stream"),
            "Content-Disposition": `attachment; filename="${String(doc.fileName || "file").replace(/"/g, "_")}"`,
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
    }

    // ---- 2-segment /:action commands & standard collection subpaths (/options, /export.csv)
    if (segments.length === 2) {
      const [res, rawSecond] = segments;
      const { base: id, action } = splitColon(rawSecond);

      if (action !== null && method === "POST") {
        const b = await readJsonBody(req);

        if (res === "users") {
          if (action === "set-password") return NextResponse.json(handleAdminSetPassword(id, b));
          if (action === "unlock") return NextResponse.json(handleUnlockUser(id));
          if (action === "reset-mfa") return NextResponse.json(handleResetMfa(id));
          if (action === "revoke-sessions") return NextResponse.json(handleRevokeSessions(id));
          if (action === "pseudonymise") return NextResponse.json(handlePseudonymiseUser(id));
        }
        if (res === "notifications" && action === "read") {
          return NextResponse.json(markNotificationRead(id));
        }
        if (res === "ai-insights") {
          if (action === "accept") return NextResponse.json(getResource("ai-insights", reviewInsight(id, true).id));
          if (action === "reject") return NextResponse.json(getResource("ai-insights", reviewInsight(id, false).id));
        }
        if (res === "work-orders") {
          if (action === "transition") {
            const target = strParam(b, "to") ?? "";
            const wo = transitionWorkOrder(id, target, req.headers.get("If-Match"), b);
            return NextResponse.json(getResource("work-orders", wo.id));
          }
          if (action === "reopen") {
            return NextResponse.json(getResource("work-orders", reopenWorkOrder(id, b).id));
          }
        }
        if (res === "maintenance-requests") {
          const out = requestCommand(id, action, b);
          return NextResponse.json(getResource(action === "convert" ? "work-orders" : "maintenance-requests", out.id));
        }
        if (res === "pm-plans") {
          if (action === "generate") {
            return NextResponse.json(getResource("work-orders", generatePmNow(id).id));
          }
          return NextResponse.json(getResource("pm-plans", pmCommand(id, action).id));
        }
        if (res === "assets") {
          if (action === "change-status") {
            return NextResponse.json(getResource("assets", changeAssetStatus(id, strParam(b, "status"), strParam(b, "reason")).id));
          }
          if (action === "change-safety") {
            return NextResponse.json(getResource("assets", changeAssetSafety(id, strParam(b, "safetyState"), strParam(b, "reason")).id));
          }
          if (action === "transfer") {
            return NextResponse.json(
              getResource("assets", transferAsset(id, strParam(b, "siteId"), strParam(b, "locationId"), strParam(b, "reason")).id),
            );
          }
          if (action === "retire") {
            const dispose = b.dispose === true || String(b.dispose) === "true";
            return NextResponse.json(getResource("assets", retireAsset(id, strParam(b, "reason"), dispose).id));
          }
        }
        if (res === "passport-tokens" && action === "revoke") {
          return NextResponse.json(getResource("passport-tokens", revokePassportToken(id).id));
        }
        if (res === "service-grants" && action === "revoke") {
          return NextResponse.json(getResource("service-grants", revokeServiceGrant(id, strParam(b, "reason")).id));
        }
        if (res === "stock-reservations") {
          if (action === "issue") {
            const mv = issueReservation(id, numParam(b, "quantity"), opKey(b, req));
            return NextResponse.json(getResource("stock-movements", mv.id));
          }
          if (action === "release") {
            return NextResponse.json(getResource("stock-reservations", releaseReservation(id).id));
          }
        }
        if (res === "cycle-counts" && action === "post") {
          return NextResponse.json(getResource("cycle-counts", postCycleCount(id).id));
        }
        if (res === "work-permits") {
          return NextResponse.json(getResource("work-permits", permitCommand(id, action, b).id));
        }
        if (res === "calibration-events") {
          return NextResponse.json(getResource("calibration-events", calibrationCommand(id, action, b).id));
        }
        if (res === "quotes") {
          return NextResponse.json(getResource("quotes", quoteCommand(id, action).id));
        }
        if (res === "billing-exports") {
          if (action === "generate") {
            return NextResponse.json(getResource("billing-exports", generateBillingExport(id).id));
          }
          if (action === "set-status") {
            return NextResponse.json(getResource("billing-exports", setBillingStatus(id, strParam(b, "status") ?? "").id));
          }
        }
        if (res === "purchase-requisitions") {
          if (action === "convert") {
            const po = convertRequisitionToPo(id, strParam(b, "vendorId"));
            return NextResponse.json(getResource("purchase-orders", po.id));
          }
          return NextResponse.json(getResource("purchase-requisitions", requisitionCommand(id, action).id));
        }
        if (res === "purchase-orders") {
          return NextResponse.json(getResource("purchase-orders", purchaseOrderCommand(id, action, b).id));
        }
        if (res === "sensor-alerts") {
          return NextResponse.json(getResource("sensor-alerts", sensorAlertCommand(id, action).id));
        }
        if (res === "outbox-events" && action === "requeue") {
          return NextResponse.json(getResource("outbox-events", requeueOutboxEvent(id).id));
        }
        if (res === "webhook-subscriptions" && action === "reveal-secret") {
          return NextResponse.json(revealWebhookSecret(id));
        }
        if (res === "integrations" && action === "test") {
          return NextResponse.json(getResource("integrations", testIntegration(id).id));
        }
        if (res === "time-entries" && action === "approve") {
          return NextResponse.json(getResource("time-entries", approveTimeEntry(id).id));
        }
      }

      if (action === null) {
        if (method === "GET" && rawSecond === "options") {
          return NextResponse.json(
            optionsResources(res, params.q ?? null, params.filterField ?? null, params.filterValue ?? null),
          );
        }
        if (method === "GET" && rawSecond === "export.csv") {
          const csv = exportCsv(res, params);
          return new NextResponse(csv, {
            status: 200,
            headers: {
              "Content-Type": "text/csv; charset=utf-8",
              "Content-Disposition": `attachment; filename="${res}.csv"`,
            },
          });
        }
        if (method === "GET") {
          const item = getResource(res, id);
          return NextResponse.json(item, {
            headers: { ETag: `"${String(item.version ?? 0)}"` },
          });
        }
        if (method === "PATCH" || method === "PUT") {
          const body = await readJsonBody(req);
          const updated = updateResource(res, id, body, req.headers.get("If-Match"));
          return NextResponse.json(updated);
        }
      }
    }

    // ---- 1-segment collection CRUD: GET /{resource}, POST /{resource}
    if (segments.length === 1) {
      const [res] = segments;
      if (method === "GET") {
        return NextResponse.json(listResources(res, params));
      }
      if (method === "POST") {
        const body = await readJsonBody(req);
        const created = createResource(res, body, req.headers.get("Idempotency-Key"));
        return NextResponse.json(created, { status: 201 });
      }
    }

    throw ApiError.notFound(`Endpoint /api/v1/${joined}`);
  });
}

async function handle(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const { path } = await context.params;
    return await dispatch(req, path ?? []);
  } catch (err) {
    return jsonError(err);
  }
}

export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handle(req, context);
}

export async function POST(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handle(req, context);
}

export async function PATCH(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handle(req, context);
}

export async function PUT(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handle(req, context);
}

export async function DELETE(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handle(req, context);
}
