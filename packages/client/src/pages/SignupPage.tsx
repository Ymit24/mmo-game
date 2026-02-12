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
      title="New Account"
      subtitle="Create your account to begin."
      footer={
        <AuthSwitchLink
          prompt="Already have an account?"
          cta="Sign in"
          to="/signin"
        />
      }
    >
      <AuthCredentialsForm
        submitLabel="Create Account"
        loadingLabel="Creating..."
        onSubmit={async (credentials) => {
          await auth.signup(credentials);
          navigate("/characters/new", { replace: true });
        }}
      />
    </AuthLayout>
  );
}
