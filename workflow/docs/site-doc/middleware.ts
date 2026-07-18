import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const session = request.cookies.get('ouro_docs_session')?.value

  if (request.nextUrl.pathname === '/login') return NextResponse.next()
  if (request.nextUrl.pathname.startsWith('/api/auth')) return NextResponse.next()

  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Check expiry
  try {
    const { exp } = JSON.parse(session)
    if (exp && exp < Math.floor(Date.now() / 1000)) {
      const res = NextResponse.redirect(new URL('/login', request.url))
      res.cookies.delete('ouro_docs_session')
      return res
    }
  } catch {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next|favicon.ico|api/auth).*)'],
}
