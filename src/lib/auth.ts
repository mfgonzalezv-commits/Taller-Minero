import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { compare } from "bcryptjs"
import { prisma } from "./prisma"
import { JWT } from "next-auth/jwt"

declare module "next-auth/jwt" {
  interface JWT {
    id?: string
    role?: string
    faenaId?: string
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const user = await prisma.usuario.findUnique({
          where: { email: credentials.email as string },
        })

        if (!user) {
          return null
        }

        const passwordMatch = await compare(
          credentials.password as string,
          user.password
        )

        if (!passwordMatch) {
          return null
        }

        return {
          id: user.id,
          email: user.email,
          nombre: user.nombre,
          rol: user.rol,
          faenaId: user.faenaId,
        }
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.id = user.id
        token.role = (user as any).rol
        token.faenaId = (user as any).faenaId
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
})
