import type { Metadata } from "next";
import { Suspense } from "react";
import { UnloadScreen } from "@/components/ref/unload-panel";

export const metadata: Metadata = { title: { absolute: "Container · StockFlow" } };

export default function ContainerDetailPage({ params }: { params: Promise<{ container: string }> }) {
  return (
    <Suspense fallback={null}>
      <Container params={params} />
    </Suspense>
  );
}

async function Container({ params }: { params: Promise<{ container: string }> }) {
  const { container } = await params;
  return <UnloadScreen number={container} />;
}
