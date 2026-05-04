import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@/auth'

export async function proxy(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    const signInUrl = new URL('/', req.nextUrl.origin)
    signInUrl.searchParams.set('next', req.nextUrl.pathname)
    return NextResponse.redirect(signInUrl)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/app/:path*'],
}
