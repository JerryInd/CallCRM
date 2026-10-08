export async function safeJson(res: Response): Promise<any> {
  try { return await res.json(); } catch { return { error: "Server error" }; }
}
