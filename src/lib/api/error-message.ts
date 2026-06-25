/**
 * apiErrorMessage — extract the REAL backend error message from a failed API
 * call so toasts can show e.g. "No items matched the selection" instead of a
 * generic "Failed to …". Understands the shapes our services + axios produce:
 *
 *   - axios error `response.data` as a Blob (responseType:'blob' requests return
 *     JSON even on error) → decoded to text, JSON.parse, then message/code.
 *   - `response.data` as a string → JSON.parse when structured, else raw text.
 *   - `response.data` as an object → message | error | detail | title.
 *   - a plain Error → `.message`.
 *
 * Async because Blob bodies must be read asynchronously; never throws (any parse
 * failure degrades to `fallback`).
 *
 * Usage:
 *   catch (e) { toast.error(await apiErrorMessage(e, 'Failed to save')); }
 *   useMutation({ onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to save')) })
 */
export async function apiErrorMessage(err: unknown, fallback = 'Something went wrong'): Promise<string> {
  try {
    if (err == null) return fallback;
    if (typeof err === 'string') return err.trim() || fallback;

    const anyErr = err as Record<string, unknown>;

    // If an interceptor already normalized it, use that.
    if (typeof anyErr.normalizedMessage === 'string' && anyErr.normalizedMessage.trim()) {
      return anyErr.normalizedMessage.trim();
    }

    const response = anyErr.response as { data?: unknown; statusText?: string } | undefined;
    if (response && 'data' in response) {
      const fromData = await messageFromBody(response.data);
      if (fromData) return fromData;
      if (response.statusText) return response.statusText;
    }

    if (typeof anyErr.message === 'string' && anyErr.message.trim()) {
      return anyErr.message.trim();
    }
  } catch {
    /* fall through */
  }
  return fallback;
}

async function messageFromBody(data: unknown): Promise<string | null> {
  if (data == null) return null;
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    return messageFromString(await data.text());
  }
  if (typeof data === 'string') return messageFromString(data);
  if (typeof data === 'object') return messageFromObject(data as Record<string, unknown>);
  return null;
}

function messageFromString(text: string): string | null {
  const trimmed = text?.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return messageFromObject(JSON.parse(trimmed));
    } catch {
      /* not JSON */
    }
  }
  if (trimmed.startsWith('<')) return null; // don't surface an HTML error page
  return trimmed;
}

function messageFromObject(obj: unknown): string | null {
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  return (
    pickString(o.message) ??
    pickString(o.error) ??
    pickString(o.detail) ??
    pickString(o.title) ??
    pickString((o.error as Record<string, unknown> | undefined)?.message)
  );
}

function pickString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}
