import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export async function redirectByRole() {
  const user = await currentUser();
  const role = (user?.unsafeMetadata?.role as string) || "student";

  if (role === "instructor") {
    redirect("/instructor");
  }

  redirect("/student");
}

export async function getUserRole() {
  const user = await currentUser();
  return (user?.unsafeMetadata?.role as string) || "student";
}

export async function requireAuth() {
  const user = await currentUser();
  if (!user) {
    redirect("/sign-in");
  }
  return user;
}
