import { env } from "@/lib/env";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return <LoginForm appUrl={env().APP_URL} />;
}
