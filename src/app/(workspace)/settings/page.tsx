import type { Metadata } from "next";
import { PackagingEditor } from "@/components/settings/packaging-editor";
import { DefinitionList } from "@/components/ui/definition-list";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";

export const metadata: Metadata = {
  title: "Settings",
};

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="System configuration, reference registries, and workspace parameters."
      />
      <div className="space-y-6">
        <Panel title="Workspace" description="Production system parameters.">
          <DefinitionList
            items={[
              { term: "Name", detail: "StockFlow" },
              { term: "Warehouses", detail: "Bornem, Turnhout, Spain, Pakistan" },
              { term: "Storage", detail: "Typed Service Interfaces (LocalAdapter / Postgres ready)" },
              { term: "Audit Log", detail: "Append-only active" },
            ]}
          />
        </Panel>
        <Panel title="Measurement & Localization" description="Measurement and timezone standards.">
          <DefinitionList
            items={[
              { term: "Weight Unit", detail: "Kilograms (kg)" },
              { term: "Summary Unit", detail: "Metric Tonnes (t), where 1 t = 1,000 kg" },
              { term: "Storage Timezone", detail: "UTC" },
              { term: "Display Timezone", detail: "Europe/Zurich" },
            ]}
          />
        </Panel>
        <Panel title="Notifications" description="Alerts for low stock, arrivals, and late purchase orders.">
          <EmptyState
            title="Notification rules"
            description="Automatic email/webhook notifications will be configured in the next phase."
          />
        </Panel>
        <PackagingEditor />
        <Panel title="Access & Authorization" description="Role-based permissions.">
          <DefinitionList
            items={[
              { term: "Admin", detail: "Views all operational data, documents, images, reports, and audit logs across all warehouses; approves or rejects requests; manages users and system settings. Cannot edit, delete, or directly modify operational records." },
              { term: "Staff", detail: "Handles operational data entry and editing (creates and edits PO/SO records and shipments, manages suppliers and customers, uploads operational documents, and views operations across all warehouses)." },
              { term: "Worker", detail: "Submits loading (SO) and unloading (PO) requests, uploads required photos, CMR, and Annex VII, selects packaging, and performs and completes assigned warehouse operations." },
            ]}
          />
        </Panel>
      </div>
    </>
  );
}
