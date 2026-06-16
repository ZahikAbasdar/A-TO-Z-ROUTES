import { redirect } from "next/navigation";
import { cookies } from "next/headers";

export default function RootPage() {
  const cookieStore = cookies();
  const token = cookieStore.get("atoz_access_token");
  if (token) redirect("/overview");
  redirect("/login");
}
