import type { NextApiRequest, NextApiResponse } from 'next'
import { serialize, parse } from 'cookie'

const KC_ISSUER = process.env.OIDC_ISSUER_URL || 'https://auth.jungmin.kim/realms/ouroboros'
const KC_CLIENT_ID = process.env.OIDC_CLIENT_ID || 'ouroboros-docs'
const KC_CLIENT_SECRET = process.env.OIDC_CLIENT_SECRET || 'docs-secret-changeme'
const REDIRECT_URI = process.env.OIDC_REDIRECT_URI || 'https://ouro-docs.jungmin.kim/api/auth/callback'
const PUBLIC_URL = process.env.PUBLIC_URL || 'https://ouro-docs.jungmin.kim'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { code, state } = req.query

  if (!code || typeof code !== 'string') {
    return res.redirect(`${PUBLIC_URL}/?error=no_code`)
  }

  // Retrieve PKCE from cookie
  const cookies = parse(req.headers.cookie || '')
  const pkceRaw = cookies.ouro_pkce
  if (!pkceRaw) {
    return res.redirect(`${PUBLIC_URL}/login?error=no_pkce`)
  }

  const { verifier, state: savedState } = JSON.parse(pkceRaw)
  if (state !== savedState) {
    return res.redirect(`${PUBLIC_URL}/login?error=state_mismatch`)
  }

  // Exchange code for tokens
  const tokenRes = await fetch(`${KC_ISSUER}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: KC_CLIENT_ID,
      client_secret: KC_CLIENT_SECRET,
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
  })

  if (!tokenRes.ok) {
    return res.redirect(`${PUBLIC_URL}/login?error=token_exchange`)
  }

  const tokens = await tokenRes.json()
  const payload = JSON.parse(Buffer.from(tokens.access_token.split('.')[1], 'base64url').toString())

  const session = {
    user_id: payload.preferred_username || payload.sub,
    roles: payload.realm_access?.roles || [],
    exp: payload.exp,
  }

  // Set session cookie, clear PKCE cookie
  res.setHeader('Set-Cookie', [
    serialize('ouro_docs_session', JSON.stringify(session), {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE !== 'false',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    }),
    serialize('ouro_pkce', '', { maxAge: 0, path: '/' }),
  ])

  res.redirect(PUBLIC_URL)
}
