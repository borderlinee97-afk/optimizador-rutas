export const API_URL = process.env.EXPO_PUBLIC_API_URL!;

export async function api(path: string, options: RequestInit = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers
  });

  if (!res.ok) {
    console.error('API error:', await res.text());
    throw new Error(`Error HTTP ${res.status}`);
  }

  return res.json();
}