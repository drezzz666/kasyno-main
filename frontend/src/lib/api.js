export async function fetchCasinoState() {
  const res = await fetch("/api/casino", { cache: "no-store" });
  if (res.status === 401) {
    window.location.href = "/api/auth/login";
    return null;
  }
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Błąd pobierania stanu kasyna");
  }
  return data;
}

export async function postCasinoAction(body) {
  const res = await fetch("/api/casino", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    window.location.href = "/api/auth/login";
    return null;
  }
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Błąd wykonywania akcji");
  }
  return data;
}

export async function fetchHistoryEntries(offset = 0, limit = 10) {
  const res = await fetch(`/api/casino/history?offset=${offset}&limit=${limit}`, {
    cache: "no-store",
  });
  if (res.status === 401) {
    window.location.href = "/api/auth/login";
    return null;
  }
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Błąd pobierania historii");
  }
  return data;
}
