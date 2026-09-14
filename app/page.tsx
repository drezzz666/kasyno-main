import CasinoApp from "./casino-app";
import { getChatGPTUser } from "./chatgpt-auth";
export const dynamic="force-dynamic";
export default async function Home(){const user=await getChatGPTUser();return <CasinoApp displayName={user?.displayName?.split("@")[0]||"Gracz"}/>}
