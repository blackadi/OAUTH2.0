async function postForm(url: string, params: URLSearchParams): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function postBasicAuth(
  url: string,
  params: URLSearchParams,
  clientId: string,
  clientSecret: string,
): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: params.toString(),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function postAdmin(url: string, body: Record<string, unknown>, auth: string): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function postJson(url: string, body: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function getJson(url: string, auth?: string): Promise<unknown> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (auth) headers['Authorization'] = `Basic ${auth}`;
  console.log(`blackadi: ${JSON.stringify(url)}`)
  console.log(`blackadi: ${JSON.stringify(headers)}`)
  const response = await fetch(url, { headers });
  console.log(`blackadi: ${JSON.stringify(response)}`)
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function getWithBearer(url: string, token: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function del(url: string, auth?: string, body?: Record<string, unknown>): Promise<unknown> {
  const headers: Record<string, string> = {};
  if (auth) headers['Authorization'] = `Basic ${auth}`;
  if (body) headers['Content-Type'] = 'application/json';

  const response = await fetch(url, {
    method: 'DELETE',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(await response.text());
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function patch(url: string, body: Record<string, unknown>, auth: string): Promise<unknown> {
  const response = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function put(url: string, body: Record<string, unknown>, auth: string): Promise<unknown> {
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export const http = {
  postForm,
  postBasicAuth,
  postAdmin,
  postJson,
  getJson,
  getWithBearer,
  del,
  patch,
  put,
};
