import { redirect } from "next/navigation";

export default function WarehousesPage() {
  // Standalone Warehouses module removed from all roles per specification.
  // Warehouse selection remains available within operational schedules, PO/SO, and inventory workflows.
  redirect("/dashboard");
}
