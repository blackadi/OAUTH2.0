export interface StoredConsent {
  scopes: string[]
  grantedAt: number
  expiresAt: number
}

export class ConsentStore {
  private store = new Map<string, StoredConsent>()
  private ttlMs: number

  constructor(ttlHours = 24) {
    this.ttlMs = ttlHours * 60 * 60 * 1000
  }

  private key(clientId: string | number, subject: string): string {
    return `${clientId}:${subject}`
  }

  isConsentGranted(clientId: string | number, subject: string, requiredScopes: string[]): boolean {
    const entry = this.store.get(this.key(clientId, subject))
    if (!entry) return false
    if (Date.now() > entry.expiresAt) {
      this.store.delete(this.key(clientId, subject))
      return false
    }
    return requiredScopes.every((s) => entry.scopes.includes(s))
  }

  storeConsent(clientId: string | number, subject: string, scopes: string[]): void {
    const now = Date.now()
    this.store.set(this.key(clientId, subject), {
      scopes,
      grantedAt: now,
      expiresAt: now + this.ttlMs,
    })
  }

  revokeConsent(clientId: string | number, subject: string): void {
    this.store.delete(this.key(clientId, subject))
  }
}

const defaultConsentStore = new ConsentStore()
export default defaultConsentStore