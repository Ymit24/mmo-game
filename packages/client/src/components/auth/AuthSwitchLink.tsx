import { Link } from "react-router-dom";

interface AuthSwitchLinkProps {
  prompt: string;
  cta: string;
  to: "/signin" | "/signup";
}

export function AuthSwitchLink({ prompt, cta, to }: AuthSwitchLinkProps) {
  return (
    <p>
      {prompt}{" "}
      <Link
        to={to}
        className="text-vec-cyan hover:text-vec-cyan text-glow-cyan transition-colors duration-150"
      >
        {cta}
      </Link>
    </p>
  );
}
