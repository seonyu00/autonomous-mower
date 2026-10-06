export function validateNewPassword(password: string) {
  return password.trim().length > 0 && [...password].length >= 10 && new TextEncoder().encode(password).length <= 72;
}
