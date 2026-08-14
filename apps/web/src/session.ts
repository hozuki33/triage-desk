import type { PublicUser } from "./api";

const TOKEN = "td_token";
const USER = "td_user";

export function saveSession(token: string, user: PublicUser) {
  localStorage.setItem(TOKEN, token);
  localStorage.setItem(USER, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN);
  localStorage.removeItem(USER);
}

export function getToken() {
  return localStorage.getItem(TOKEN);
}

export function getUser(): PublicUser | null {
  const raw = localStorage.getItem(USER);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PublicUser;
  } catch {
    return null;
  }
}
