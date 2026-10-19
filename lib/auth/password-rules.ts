/** /lib/auth/password-rules.ts — password rules, shared by the forms and the server (client-safe). */
export const MIN_PASSWORD = 10;

export function passwordProblem(pw: string): string | null {
  if (typeof pw !== "string" || pw.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (pw.length > 200) return "That password is too long.";
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return "Use a mix of letters and numbers.";
  return null;
}
