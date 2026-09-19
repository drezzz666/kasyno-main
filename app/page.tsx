import CasinoApp from "./casino-app";
import { requireAuthUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireAuthUser();
  return <CasinoApp initialUser={user} />;
}
