import { notFound } from "next/navigation";
import CircleDashboard from "@/components/CircleDashboard";
import { getStore } from "@/lib/store";
import { hasAi } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function CirclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const circle = await (await getStore()).getCircle(id);
  if (!circle) notFound();
  return <CircleDashboard initial={circle} aiMode={hasAi() ? "claude" : "fallback"} />;
}
