import { auth } from "@/auth";
import Chat from "@/components/Chat";
import SignIn from "@/components/SignIn";

export default async function Home() {
  const session = await auth();

  if (!session?.user) {
    return <SignIn />;
  }

  return <Chat />;
}
