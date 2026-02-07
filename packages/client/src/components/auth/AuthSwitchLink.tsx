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
      <Link to={to} className="text-cyan hover:text-cyan-glow transition-colors duration-200">
        {cta}
      </Link>
    </p>
  );
}
