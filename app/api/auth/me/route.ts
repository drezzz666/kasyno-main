import { parseCookie, verifySession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cookieHeader = request.headers.get("cookie");
  const sessionToken = parseCookie(cookieHeader, "casino_session");

  if (!sessionToken) {
    return Response.json({ authenticated: false, user: null }, { status: 401 });
  }

  const user = await verifySession(sessionToken);
  if (!user) {
    return Response.json({ authenticated: false, user: null }, { status: 401 });
  }

  return Response.json({
    authenticated: true,
    user: {
      userId: user.userId,
      email: user.email,
      nick: user.nick,
      fullName: user.fullName || null,
    },
  });
}
