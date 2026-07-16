import { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user?: {
      id?: string
      nombre?: string
      rol?: string
      faenaId?: string
    } & DefaultSession["user"]
  }

  interface User {
    id?: string
    nombre?: string
    rol?: string
    faenaId?: string
  }
}
