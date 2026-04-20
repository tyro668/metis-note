import crypto from "node:crypto"

export interface DerivedSyncKeys {
  contentKey: Buffer
  metadataKey: Buffer
}

/**
 * Derive two keys from a user passphrase via PBKDF2 + HKDF.
 * - contentKey: for AES-256-GCM encryption/decryption
 * - metadataKey: for HMAC-SHA256 fingerprint generation
 */
export function deriveKeys(passphrase: string, salt: Buffer): DerivedSyncKeys {
  const masterKey = crypto.pbkdf2Sync(passphrase, salt, 600_000, 32, "sha256")

  return {
    contentKey: hkdfExpand(masterKey, "metis-note-sync-content"),
    metadataKey: hkdfExpand(masterKey, "metis-note-sync-metadata"),
  }
}

function hkdfExpand(key: Buffer, info: string): Buffer {
  return Buffer.from(crypto.hkdfSync("sha256", key, Buffer.alloc(0), info, 32))
}

// ── Encrypt / Decrypt ──────────────────────────────────────────

export interface EncryptedPayload {
  v: 1
  iv: string
  tag: string
  ct: string
}

export function encrypt(data: Buffer, contentKey: Buffer): Buffer {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", contentKey, iv)
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()])
  const tag = cipher.getAuthTag()

  const payload: EncryptedPayload = {
    v: 1,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ct: encrypted.toString("base64"),
  }

  return Buffer.from(JSON.stringify(payload))
}

export function decrypt(encryptedBuf: Buffer, contentKey: Buffer): Buffer {
  const payload = JSON.parse(encryptedBuf.toString()) as EncryptedPayload
  const iv = Buffer.from(payload.iv, "base64")
  const tag = Buffer.from(payload.tag, "base64")
  const ct = Buffer.from(payload.ct, "base64")

  const decipher = crypto.createDecipheriv("aes-256-gcm", contentKey, iv)
  decipher.setAuthTag(tag)

  return Buffer.concat([decipher.update(ct), decipher.final()])
}

// ── Passphrase verification ────────────────────────────────────

const VERIFICATION_PLAINTEXT = "metis-note-sync-verification-v1"

export function createVerificationTag(contentKey: Buffer): string {
  return encrypt(Buffer.from(VERIFICATION_PLAINTEXT), contentKey).toString("base64")
}

export function verifyPassphrase(verificationTag: string, contentKey: Buffer): boolean {
  try {
    const decrypted = decrypt(Buffer.from(verificationTag, "base64"), contentKey)
    return decrypted.toString() === VERIFICATION_PLAINTEXT
  } catch {
    return false
  }
}

// ── Passphrase migration ───────────────────────────────────────

export function generateSalt(): string {
  return crypto.randomBytes(32).toString("hex")
}
