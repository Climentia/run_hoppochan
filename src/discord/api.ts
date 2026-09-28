export async function editOriginal(applicationId: string, token: string, payload: unknown): Promise<void> {
  const response = await fetch(`https://discord.com/api/v10/webhooks/${encodeURIComponent(applicationId)}/${encodeURIComponent(token)}/messages/@original`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`Discord followup failed (${response.status})`);
}

export async function postWebhook(url: string, payload: unknown): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`Discord webhook failed (${response.status})`);
}
