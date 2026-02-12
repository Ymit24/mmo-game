import { useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { AuthCredentialsForm } from "../components/auth/AuthCredentialsForm";
import { AuthLayout } from "../components/auth/AuthLayout";
import { AuthSwitchLink } from "../components/auth/AuthSwitchLink";

interface LocationState {
  from?: {
    pathname?: string;
  };
}

export function SigninPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const fromPath =
    (location.state as LocationState | null)?.from?.pathname ?? "/play";

  return (
    <AuthLayout
      title="Sign In"
      subtitle="Enter your credentials."
      footer={
        <AuthSwitchLink prompt="No account?" cta="Create one" to="/signup" />
      }
    >
      <AuthCredentialsForm
        submitLabel="Sign In"
        loadingLabel="Signing in..."
        onSubmit={async (credentials) => {
          await auth.signin(credentials);
          navigate(fromPath, { replace: true });
        }}
      />
    </AuthLayout>
  );
}
