import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { puedeAcceder } from '@/lib/roles'

export default auth((req) => {
  const { nextUrl, auth: session } = req
  const isLoggedIn = !!session
  const isPublic = nextUrl.pathname.startsWith('/login')

  if (!isLoggedIn && !isPublic) {
    return NextResponse.redirect(new URL('/login', nextUrl))
  }

  if (isLoggedIn && isPublic) {
    return NextResponse.redirect(new URL('/dashboard', nextUrl))
  }

  if (isLoggedIn && session?.user?.rol) {
    if (!puedeAcceder(session.user.rol, nextUrl.pathname)) {
      return NextResponse.redirect(new URL('/dashboard', nextUrl))
    }
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
