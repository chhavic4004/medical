export async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let data: any = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    const receivedHtml =
      /^\s*</.test(text) ||
      response.headers.get("content-type")?.includes("text/html");

    throw new Error(
      receivedHtml
        ? `Server returned HTML instead of JSON (${response.status}).`
        : `Server returned an invalid JSON response (${response.status}).`
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.error ||
      data?.message ||
      `Request failed (${response.status}).`
    );
  }

  return data as T;
}
