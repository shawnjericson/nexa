/** Who is calling: resolved from a verified access token by requireAuth. */
export interface AuthContext {
  userId: string;
  /** Login session (refresh-token family) the access token was issued for. */
  sessionId: string;
}
