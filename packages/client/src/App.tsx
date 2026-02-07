import { LandingPage } from "./LandingPage";

/**
 * Root application component.
 *
 * Currently renders the landing page directly. When auth and account
 * management are added, this will become the routing root:
 *
 *   / -> LandingPage
 *   /login -> LoginPage
 *   /register -> RegisterPage
 *   /account -> AccountPage (authenticated)
 *   /play -> GameClient (authenticated, WebSocket)
 */
export function App() {
  // TODO: add router (react-router or custom) + auth context provider
  return <LandingPage />;
}
