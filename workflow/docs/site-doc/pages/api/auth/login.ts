import type { NextApiRequest, NextApiResponse } from 'next'
import crypto from 'crypto'
import { serialize } from 'cookie'

const KC_ISSUER = process.env.OIDC_ISSUER_URL || 'https://auth.jungmin.kim/realms/ouroboros'
const KC_CLIENT_ID = process.env.OIDC_CLIENT_ID || 'ouroboros-docs'
const REDIRECT_URI = process.env.OIDC_REDIRECT_URI || 'https://ouro-docs.jungmin.kim/api/auth/callback'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const verifier = crypto.randomBytes(32).toString('base64url')
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  const state = crypto.randomBytes(16).toString('hex')

  const authUrl = new URL(`${KC_ISSUER}/protocol/openid-connect/auth`)
  authUrl.searchParams.set('client_id', KC_CLIENT_ID)
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', 'openid profile')
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('code_challenge', challenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')

  res.setHeader('Set-Cookie', serialize('ouro_pkce', JSON.stringify({ verifier, state }), {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE !== 'false',
    sameSite: 'lax',
    maxAge: 300,
    path: '/',
  }))

  res.redirect(302, authUrl.toString())
}
