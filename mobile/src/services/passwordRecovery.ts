// Navigation remounts after recovery creates a session. Exchange a one-use code once.
export function createRecoveryCodeExchange(exchange: (code: string) => Promise<{error: {message: string} | null}>) {
  let currentCode: string | null = null
  let pending: Promise<void> | null = null
  return (code: string): Promise<void> => {
    if (!pending || code !== currentCode) {
      currentCode = code
      pending = exchange(code).then(result => { if (result.error) throw new Error(result.error.message) })
    }
    return pending
  }
}
