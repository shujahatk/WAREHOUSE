import { redirect } from "next/navigation";

export default function OffersPage() {
  // Standalone Offers Dashboard removed per specification.
  // Redirect directly to Purchasing Offers catalog.
  redirect("/offers/purchasing");
}
