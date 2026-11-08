"use client";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { Icon } from "@/lib/icons";

const REPORTS = [
  { type: "WORK_ORDER_SUMMARY", title: "Work order summary", icon: "ClipboardList", desc: "All work orders created in the period with status, cost and due dates." },
  { type: "ASSET_REGISTER", title: "Asset register", icon: "Boxes", desc: "Complete equipment register with criticality, status, warranty and value." },
  { type: "PM_COMPLIANCE", title: "PM compliance", icon: "CalendarCheck", desc: "Preventive maintenance occurrences due in the period and on-time completion." },
  { type: "INVENTORY_VALUATION", title: "Inventory valuation", icon: "Package", desc: "On-hand, reserved and available quantities with stock value." },
  { type: "SLA_PERFORMANCE", title: "SLA performance", icon: "Timer", desc: "Contracted resolution targets versus actual completion." },
  { type: "DOWNTIME", title: "Downtime analysis", icon: "TriangleAlert", desc: "Breakdown and planned downtime intervals by asset and failure mode." },
  { type: "CALIBRATION_STATUS", title: "Calibration status", icon: "Ruler", desc: "Instrument calibration schedule, last results and overdue items." },
  { type: "COST_BY_SITE", title: "Cost by site", icon: "Factory", desc: "Labor and parts cost of closed work aggregated by site." },
];

const DOCUMENTS = [
  { href: "/m/work-orders", title: "Work order report", icon: "ClipboardList", desc: "Open any work order and choose Print for a signed job report." },
  { href: "/m/assets", title: "Asset history & QR label", icon: "QrCode", desc: "Equipment passport with maintenance history." },
  { href: "/m/quotes", title: "Quotation", icon: "Receipt", desc: "Customer-ready quotation with tax and validity." },
  { href: "/m/work-permits", title: "Permit to work", icon: "FileLock", desc: "Printable permit with hazards, controls and isolations." },
  { href: "/m/purchase-orders", title: "Purchase order", icon: "ShoppingCart", desc: "Vendor purchase order document." },
  { href: "/m/calibration-events", title: "Calibration certificate", icon: "Ruler", desc: "As-found / as-left results and approval." },
  { href: "/m/inspection-results", title: "Inspection record", icon: "FileCheck", desc: "Completed checklist with outcome and defects." },
  { href: "/m/billing-exports", title: "Billing statement", icon: "FileOutput", desc: "Billing batch summary for ERP and customer." },
];

export default function Reports() {
  const t = useT();
  return (
    <>
      <PageHeader icon="FileBarChart" title={t("Reports")} subtitle="Authorized, printable and exportable reports. Data respects your tenant and role scope."
        actions={<Link className="btn" href="/m/report-jobs"><Icon name="History" size={16} />Report jobs</Link>} />
      <div className="stack">
        <h2>Management reports</h2>
        <div className="grid grid-4">
          {REPORTS.map((r) => (
            <Link key={r.type} href={`/reports/${r.type}`} className="card stat">
              <div className="label"><Icon name={r.icon} size={16} />{r.title}</div>
              <div className="small muted" style={{ whiteSpace: "normal" }}>{r.desc}</div>
            </Link>
          ))}
        </div>
        <h2 style={{ marginTop: 8 }}>Record documents</h2>
        <div className="grid grid-4">
          {DOCUMENTS.map((r) => (
            <Link key={r.title} href={r.href} className="card stat">
              <div className="label"><Icon name={r.icon} size={16} />{r.title}</div>
              <div className="small muted" style={{ whiteSpace: "normal" }}>{r.desc}</div>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
