import { NextResponse, type NextRequest } from "next/server";

const REALM = "mp4-to-webgl";

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

export function middleware(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();

  const username = process.env.APP_USERNAME ?? "demo";
  const header = req.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    const decoded = atob(header.slice("Basic ".length));
    const sep = decoded.indexOf(":");
    const user = sep === -1 ? decoded : decoded.slice(0, sep);
    const pass = sep === -1 ? "" : decoded.slice(sep + 1);
    if (user === username && pass === password) {
      return NextResponse.next();
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": `Basic realm="${REALM}", charset="UTF-8"` },
  });
}
