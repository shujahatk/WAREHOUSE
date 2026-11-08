import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui/page-header";

export function WorkspacePage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <>
      <PageHeader title={title} description={description} />
      {children}
    </>
  );
}
