import { useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { AuthCredentialsForm } from "../components/auth/AuthCredentialsForm";
import { AuthLayout } from "../components/auth/AuthLayout";
import { AuthSwitchLink } from "../components/auth/AuthSwitchLink";

export function SignupPage() {
  const auth = useAuth();
  const navigate = useNavigate();

  return (
    <AuthLayout
      title="Create your identity"
      subtitle="Claim your account now and enter the persistent world."
      footer={
        <AuthSwitchLink
          prompt="Already registered?"
          cta="Sign in"
          to="/signin"
        />
      }
    >
      <AuthCredentialsForm
        submitLabel="Create Account"
        loadingLabel="Creating account..."
        onSubmit={async (credentials) => {
          await auth.signup(credentials);
          navigate("/play", { replace: true });
        }}
      />
    </AuthLayout>
  );
}
