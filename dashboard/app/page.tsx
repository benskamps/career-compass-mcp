import { redirect } from "next/navigation";
import { getDataStatus } from "@/lib/data";

export default async function Home() {
  const status = await getDataStatus();
  if (status === "empty" || status === "incomplete") {
    redirect("/onboarding");
  }
  redirect("/pipeline");
}
