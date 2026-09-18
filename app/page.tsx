import CasinoApp from "./casino-app";
import { getAuthUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getAuthUser();
  return <CasinoApp initialUser={user} />;
}
