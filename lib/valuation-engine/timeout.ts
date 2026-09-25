export class TimeoutError extends Error {
  constructor(label: string, timeoutMs: number) {
    super(`${label} timed out after ${timeoutMs}ms`);
    this.name = "TimeoutError";
  }
}

export async function withTimeout<T>(
  label: string,
  timeoutMs: number,
  work: Promise<T>,
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;

  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(
      () => reject(new TimeoutError(label, timeoutMs)),
      timeoutMs,
    );
  });

  try {
    return await Promise.race([work, deadline]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
