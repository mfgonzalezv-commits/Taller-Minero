import type { NextAuthConfig } from "next-auth"

// Config liviana, sin Prisma, para que el middleware (Edge runtime) pueda usarla
export const authConfig: NextAuthConfig = {
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.id = user.id
        token.role = user.rol
        token.faenaId = user.faenaId
      }
      return token
    },
    session: async ({ session, token }) => {
      return {
        ...session,
        user: {
          ...session.user,
          id: token.id,
          rol: token.role,
          faenaId: token.faenaId,
        },
      }
    },
  },
}
