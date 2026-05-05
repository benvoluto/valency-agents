import { NextResponse } from 'next/server'
import { auth } from '@/auth'

export default auth((req) => {
  const isAppRoute = req.nextUrl.pathname.startsWith('/app')
  const isOnboardingRoute = req.nextUrl.pathname.startsWith('/onboarding')
  if ((isAppRoute || isOnboardingRoute) && !req.auth) {
    const signInUrl = new URL('/', req.nextUrl.origin)
    signInUrl.searchParams.set('next', req.nextUrl.pathname)
    return NextResponse.redirect(signInUrl)
  }
  return NextResponse.next()
})

export const config = {
  matcher: ['/app/:path*', '/onboarding/:path*'],
}
