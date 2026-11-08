import type { User } from "./auth";

export interface ActionField {
  name: string;
  label: string;
  type: "text" | "textarea" | "enum" | "bool" | "ref" | "number" | "datetime";
  options?: string[];
  ref?: string;
  required?: boolean;
}

export interface ActionDef {
  key: string;
  label: string;
  icon: string;
  endpoint: (id: string) => string;
  when?: (row: Record<string, unknown>) => boolean;
  roles?: string[];
  fields?: ActionField[];
  confirm?: string;
  danger?: boolean;
  /** When the command returns a record of another resource, open it. */
  navigate?: string;
  versioned?: boolean;
  body?: Record<string, unknown>;
  /** Display the command's JSON result instead of navigating. */
  showResult?: boolean;
}

const s = (row: Record<string, unknown>) => String(row.status ?? "");
const is = (...v: string[]) => (row: Record<string, unknown>) => v.includes(s(row));
const reason: ActionField = { name: "reason", label: "Reason", type: "textarea", required: true };

export const ACTIONS: Record<string, ActionDef[]> = {
  "maintenance-requests": [
    { key: "ack", label: "Acknowledge", icon: "Check", endpoint: (id) => `/maintenance-requests/${id}:acknowledge`, when: is("SUBMITTED"), roles: ["MANAGER", "DISPATCHER", "PLANNER"] },
    { key: "triage", label: "Triage", icon: "Filter", endpoint: (id) => `/maintenance-requests/${id}:triage`, when: is("SUBMITTED", "ACKNOWLEDGED"), roles: ["MANAGER", "DISPATCHER", "PLANNER"],
      fields: [{ name: "priority", label: "Priority", type: "enum", options: ["CRITICAL", "HIGH", "MEDIUM", "LOW", "PLANNED"] }, { name: "note", label: "Triage note", type: "textarea" }] },
    { key: "convert", label: "Convert to work order", icon: "ArrowRight", endpoint: (id) => `/maintenance-requests/${id}:convert`, when: is("SUBMITTED", "ACKNOWLEDGED", "TRIAGED"), roles: ["MANAGER", "DISPATCHER", "PLANNER"], navigate: "work-orders",
      fields: [{ name: "workType", label: "Work type", type: "enum", options: ["CORRECTIVE", "EMERGENCY", "INSPECTION"] }] },
    { key: "dup", label: "Link duplicate", icon: "Link", endpoint: (id) => `/maintenance-requests/${id}:link-duplicate`, when: is("SUBMITTED", "ACKNOWLEDGED", "TRIAGED"), roles: ["MANAGER", "DISPATCHER", "PLANNER"],
      fields: [{ name: "originalId", label: "Original request", type: "ref", ref: "maintenance-requests", required: true }] },
    { key: "reject", label: "Reject", icon: "Ban", danger: true, endpoint: (id) => `/maintenance-requests/${id}:reject`, when: is("SUBMITTED", "ACKNOWLEDGED", "TRIAGED"), roles: ["MANAGER", "DISPATCHER", "PLANNER"], fields: [reason] },
  ],
  "pm-plans": [
    { key: "approve", label: "Approve", icon: "Check", endpoint: (id) => `/pm-plans/${id}:approve`, when: is("DRAFT"), roles: ["MANAGER", "PLANNER"] },
    { key: "activate", label: "Activate", icon: "Play", endpoint: (id) => `/pm-plans/${id}:activate`, when: is("DRAFT", "APPROVED"), roles: ["MANAGER", "PLANNER"] },
    { key: "generate", label: "Generate work now", icon: "Wrench", endpoint: (id) => `/pm-plans/${id}:generate`, when: is("ACTIVE"), roles: ["MANAGER", "PLANNER"], navigate: "work-orders" },
    { key: "pause", label: "Pause", icon: "Pause", endpoint: (id) => `/pm-plans/${id}:pause`, when: is("ACTIVE"), roles: ["MANAGER", "PLANNER"] },
    { key: "resume", label: "Resume", icon: "Play", endpoint: (id) => `/pm-plans/${id}:resume`, when: is("PAUSED"), roles: ["MANAGER", "PLANNER"] },
    { key: "retire", label: "Retire", icon: "Archive", danger: true, confirm: "Retire this plan? No further work will be generated.", endpoint: (id) => `/pm-plans/${id}:retire`, when: (r) => s(r) !== "RETIRED", roles: ["MANAGER", "PLANNER"] },
  ],
  assets: [
    { key: "status", label: "Change status", icon: "RefreshCw", endpoint: (id) => `/assets/${id}:change-status`, roles: ["MANAGER", "PLANNER"], when: (r) => s(r) !== "DISPOSED",
      fields: [{ name: "status", label: "New status", type: "enum", required: true, options: ["PROPOSED", "ACTIVE", "OUT_OF_SERVICE", "UNDER_MAINTENANCE", "QUARANTINED"] }, reason] },
    { key: "safety", label: "Safety state", icon: "ShieldAlert", endpoint: (id) => `/assets/${id}:change-safety`, roles: ["SAFETY_OFFICER", "MANAGER"],
      fields: [{ name: "safetyState", label: "Safety state", type: "enum", required: true, options: ["CLEAR", "RESTRICTED", "LOCKED_OUT", "PERMIT_REQUIRED"] }, reason] },
    { key: "transfer", label: "Transfer", icon: "ArrowLeftRight", endpoint: (id) => `/assets/${id}:transfer`, roles: ["MANAGER"], when: (r) => !["RETIRED", "DISPOSED"].includes(s(r)),
      fields: [{ name: "siteId", label: "Destination site", type: "ref", ref: "sites", required: true }, { name: "locationId", label: "Location", type: "ref", ref: "locations" }, reason] },
    { key: "token", label: "Issue QR passport", icon: "QrCode", endpoint: (id) => `/assets/${id}/passport-tokens`, roles: ["MANAGER", "PLANNER"], when: (r) => !["RETIRED", "DISPOSED"].includes(s(r)),
      confirm: "Issuing a new QR token revokes any existing token for this asset." },
    { key: "retire", label: "Retire", icon: "Archive", danger: true, endpoint: (id) => `/assets/${id}:retire`, roles: ["MANAGER"], when: (r) => !["RETIRED", "DISPOSED"].includes(s(r)),
      fields: [reason, { name: "dispose", label: "Mark as disposed", type: "bool" }] },
  ],
  "passport-tokens": [
    { key: "revoke", label: "Revoke", icon: "Ban", danger: true, confirm: "Revoke this QR token? Printed labels using it will stop working.", endpoint: (id) => `/passport-tokens/${id}:revoke`, when: is("ACTIVE"), roles: ["MANAGER", "PLANNER"] },
  ],
  "service-grants": [
    { key: "revoke", label: "Revoke grant", icon: "Ban", danger: true, endpoint: (id) => `/service-grants/${id}:revoke`, when: is("ACTIVE"), roles: ["MANAGER"], fields: [reason] },
  ],
  "work-permits": [
    { key: "submit", label: "Submit", icon: "Send", endpoint: (id) => `/work-permits/${id}:submit`, when: is("DRAFT") },
    { key: "verify", label: "Verify", icon: "ClipboardCheck", endpoint: (id) => `/work-permits/${id}:verify`, when: is("SUBMITTED"), roles: ["SAFETY_OFFICER", "MANAGER"] },
    { key: "issue", label: "Issue permit", icon: "BadgeCheck", endpoint: (id) => `/work-permits/${id}:issue`, when: is("VERIFIED"), roles: ["SAFETY_OFFICER"] },
    { key: "activate", label: "Accept & activate", icon: "Play", endpoint: (id) => `/work-permits/${id}:activate`, when: is("ISSUED"), fields: [{ name: "acceptedBy", label: "Accepting worker", type: "text", required: true }] },
    { key: "suspend", label: "Suspend", icon: "Pause", endpoint: (id) => `/work-permits/${id}:suspend`, when: is("ACTIVE"), roles: ["SAFETY_OFFICER", "MANAGER"], fields: [reason] },
    { key: "resume", label: "Resume", icon: "Play", endpoint: (id) => `/work-permits/${id}:resume`, when: is("SUSPENDED"), roles: ["SAFETY_OFFICER"] },
    { key: "close", label: "Close", icon: "CircleCheck", endpoint: (id) => `/work-permits/${id}:close`, when: is("ISSUED", "ACTIVE", "SUSPENDED") },
    { key: "revoke", label: "Revoke", icon: "Ban", danger: true, endpoint: (id) => `/work-permits/${id}:revoke`, when: (r) => !["CLOSED", "REVOKED", "EXPIRED"].includes(s(r)), roles: ["SAFETY_OFFICER", "MANAGER"], fields: [reason] },
  ],
  "calibration-events": [
    { key: "found", label: "Record as-found", icon: "ClipboardPen", endpoint: (id) => `/calibration-events/${id}:record-as-found`, when: is("SCHEDULED"), roles: ["CALIBRATION_OFFICER", "MANAGER"],
      fields: [{ name: "asFound", label: "As-found result", type: "textarea", required: true }, { name: "inTolerance", label: "Within tolerance", type: "bool" }] },
    { key: "adjust", label: "Mark adjusted", icon: "Wrench", endpoint: (id) => `/calibration-events/${id}:adjust`, when: is("AS_FOUND"), roles: ["CALIBRATION_OFFICER", "MANAGER"] },
    { key: "left", label: "Record as-left", icon: "ClipboardCheck", endpoint: (id) => `/calibration-events/${id}:record-as-left`, when: is("AS_FOUND", "ADJUSTED"), roles: ["CALIBRATION_OFFICER", "MANAGER"],
      fields: [{ name: "asLeft", label: "As-left result", type: "textarea", required: true }, { name: "inTolerance", label: "Within tolerance", type: "bool" }, { name: "certificateNo", label: "Certificate number", type: "text" }] },
    { key: "review", label: "Review", icon: "Eye", endpoint: (id) => `/calibration-events/${id}:review`, when: is("AS_LEFT"), roles: ["CALIBRATION_OFFICER", "MANAGER"] },
    { key: "approve", label: "Approve", icon: "BadgeCheck", endpoint: (id) => `/calibration-events/${id}:approve`, when: is("REVIEWED"), roles: ["CALIBRATION_OFFICER", "MANAGER"] },
    { key: "reject", label: "Reject", icon: "Ban", danger: true, endpoint: (id) => `/calibration-events/${id}:reject`, when: (r) => !["APPROVED", "REJECTED"].includes(s(r)), roles: ["CALIBRATION_OFFICER", "MANAGER"] },
  ],
  quotes: [
    { key: "send", label: "Send to customer", icon: "Send", endpoint: (id) => `/quotes/${id}:send`, when: is("DRAFT"), roles: ["COMMERCIAL", "MANAGER"] },
    { key: "approve", label: "Approve", icon: "Check", endpoint: (id) => `/quotes/${id}:approve`, when: is("SENT"), roles: ["COMMERCIAL", "MANAGER", "CUSTOMER"] },
    { key: "reject", label: "Decline", icon: "Ban", danger: true, endpoint: (id) => `/quotes/${id}:reject`, when: is("SENT"), roles: ["COMMERCIAL", "MANAGER", "CUSTOMER"] },
  ],
  "billing-exports": [
    { key: "generate", label: "Generate batch", icon: "RefreshCw", endpoint: (id) => `/billing-exports/${id}:generate`, when: is("PENDING"), roles: ["COMMERCIAL", "MANAGER"] },
    { key: "ack", label: "Mark acknowledged", icon: "Check", endpoint: (id) => `/billing-exports/${id}:set-status`, body: { status: "ACKNOWLEDGED" }, when: is("PENDING"), roles: ["COMMERCIAL", "MANAGER"] },
    { key: "rej", label: "Mark rejected", icon: "Ban", danger: true, endpoint: (id) => `/billing-exports/${id}:set-status`, body: { status: "REJECTED" }, when: is("PENDING"), roles: ["COMMERCIAL", "MANAGER"] },
    { key: "rev", label: "Reverse", icon: "Undo2", danger: true, endpoint: (id) => `/billing-exports/${id}:set-status`, body: { status: "REVERSED" }, when: is("ACKNOWLEDGED"), roles: ["COMMERCIAL", "MANAGER"] },
  ],
  "purchase-requisitions": [
    { key: "submit", label: "Submit", icon: "Send", endpoint: (id) => `/purchase-requisitions/${id}:submit`, when: is("DRAFT"), roles: ["PROCUREMENT", "MANAGER"] },
    { key: "approve", label: "Approve", icon: "Check", endpoint: (id) => `/purchase-requisitions/${id}:approve`, when: is("SUBMITTED"), roles: ["PROCUREMENT", "MANAGER"] },
    { key: "reject", label: "Reject", icon: "Ban", danger: true, endpoint: (id) => `/purchase-requisitions/${id}:reject`, when: is("SUBMITTED"), roles: ["PROCUREMENT", "MANAGER"] },
    { key: "convert", label: "Create purchase order", icon: "ShoppingCart", endpoint: (id) => `/purchase-requisitions/${id}:convert`, when: is("APPROVED"), roles: ["PROCUREMENT", "MANAGER"], navigate: "purchase-orders",
      fields: [{ name: "vendorId", label: "Vendor", type: "ref", ref: "vendors", required: true }] },
  ],
  "purchase-orders": [
    { key: "issue", label: "Issue to vendor", icon: "Send", endpoint: (id) => `/purchase-orders/${id}:issue`, when: is("DRAFT"), roles: ["PROCUREMENT", "MANAGER"] },
    { key: "receive", label: "Receive goods", icon: "PackageCheck", endpoint: (id) => `/purchase-orders/${id}:receive`, when: is("ISSUED", "PARTIALLY_RECEIVED"), roles: ["STOREKEEPER", "PROCUREMENT", "MANAGER"],
      fields: [{ name: "quantity", label: "Quantity received (blank = remaining)", type: "number" }] },
    { key: "cancel", label: "Cancel", icon: "Ban", danger: true, confirm: "Cancel this purchase order?", endpoint: (id) => `/purchase-orders/${id}:cancel`, when: is("DRAFT", "ISSUED"), roles: ["PROCUREMENT", "MANAGER"] },
  ],
  "stock-reservations": [
    { key: "issue", label: "Issue parts", icon: "PackageCheck", endpoint: (id) => `/stock-reservations/${id}:issue`, when: is("OPEN"), roles: ["STOREKEEPER", "MANAGER", "TECHNICIAN", "PLANNER"],
      fields: [{ name: "quantity", label: "Quantity (blank = all remaining)", type: "number" }] },
    { key: "release", label: "Release", icon: "Undo2", endpoint: (id) => `/stock-reservations/${id}:release`, when: is("OPEN"), roles: ["STOREKEEPER", "MANAGER", "TECHNICIAN", "PLANNER"] },
  ],
  "cycle-counts": [
    { key: "post", label: "Post count", icon: "Check", confirm: "Post this count? Any variance becomes a stock adjustment.", endpoint: (id) => `/cycle-counts/${id}:post`, when: is("DRAFT"), roles: ["STOREKEEPER", "MANAGER"] },
  ],
  "ai-insights": [
    { key: "accept", label: "Accept", icon: "Check", endpoint: (id) => `/ai-insights/${id}:accept`, when: is("PROPOSED"), roles: ["MANAGER", "PLANNER"] },
    { key: "reject", label: "Dismiss", icon: "X", endpoint: (id) => `/ai-insights/${id}:reject`, when: is("PROPOSED"), roles: ["MANAGER", "PLANNER"] },
  ],
  "sensor-alerts": [
    { key: "ack", label: "Acknowledge", icon: "Check", endpoint: (id) => `/sensor-alerts/${id}:acknowledge`, when: is("OPEN") },
    { key: "convert", label: "Create work order", icon: "Wrench", endpoint: (id) => `/sensor-alerts/${id}:convert`, when: is("OPEN", "ACKNOWLEDGED") },
    { key: "clear", label: "Clear", icon: "CircleCheck", endpoint: (id) => `/sensor-alerts/${id}:clear`, when: is("OPEN", "ACKNOWLEDGED") },
  ],
  sensors: [
    { key: "reading", label: "Record reading", icon: "Activity", endpoint: (id) => `/sensors/${id}/readings`, roles: ["MANAGER", "TECHNICIAN", "PLANNER"],
      fields: [{ name: "value", label: "Value", type: "number", required: true }] },
  ],
  "outbox-events": [
    { key: "requeue", label: "Requeue delivery", icon: "RotateCcw", endpoint: (id) => `/outbox-events/${id}:requeue`, when: is("DEAD_LETTER", "RETRY"), roles: ["MANAGER"] },
  ],
  "webhook-subscriptions": [
    { key: "secret", label: "Reveal signing secret", icon: "KeyRound", endpoint: (id) => `/webhook-subscriptions/${id}:reveal-secret`, roles: ["MANAGER"], showResult: true,
      confirm: "The signing secret will be displayed. Share it only with the receiving system's owner. This action is audited." },
  ],
  integrations: [
    { key: "test", label: "Test connection", icon: "Plug", endpoint: (id) => `/integrations/${id}:test`, roles: ["MANAGER"] },
  ],
  users: [
    { key: "pw", label: "Set password", icon: "KeyRound", endpoint: (id) => `/users/${id}:set-password`, roles: ["ADMIN"],
      fields: [{ name: "password", label: "New password (min. 10 chars, letters and digits)", type: "text", required: true }] },
    { key: "unlock", label: "Unlock account", icon: "LockOpen", endpoint: (id) => `/users/${id}:unlock`, roles: ["ADMIN"], when: (r) => !!r.lockedUntil && new Date(String(r.lockedUntil)) > new Date() },
    { key: "mfa", label: "Reset two-step sign-in", icon: "ShieldOff", endpoint: (id) => `/users/${id}:reset-mfa`, roles: ["ADMIN"], when: (r) => !!r.mfaEnrolledAt,
      confirm: "The user will have to enrol their authenticator again and is signed out everywhere." },
    { key: "pseudo", label: "Pseudonymise", icon: "UserX", endpoint: (id) => `/users/${id}:pseudonymise`, roles: ["ADMIN"], danger: true, when: (r) => r.status === "OFFBOARDED",
      confirm: "Name, e-mail, phone and credentials will be replaced irreversibly. Work history and audit records keep the pseudonym." },
    { key: "revoke", label: "Sign out everywhere", icon: "LogOut", endpoint: (id) => `/users/${id}:revoke-sessions`, roles: ["ADMIN"], danger: true,
      confirm: "All existing sessions and devices for this user will be signed out immediately." },
  ],
  "work-orders": [],
};

export function visibleActions(path: string, row: Record<string, unknown>, user: User | null): ActionDef[] {
  return (ACTIONS[path] ?? []).filter((a) => (!a.when || a.when(row)) && (!a.roles || (user && (user.role === "ADMIN" || a.roles.includes(user.role)))));
}

/** Printable document views available for a resource. */
export const PRINTABLE: Record<string, string> = {
  "work-orders": "work-order",
  assets: "asset",
  quotes: "quote",
  "work-permits": "permit",
  "purchase-orders": "purchase-order",
  "calibration-events": "calibration",
  "inspection-results": "inspection",
  "billing-exports": "billing",
};
