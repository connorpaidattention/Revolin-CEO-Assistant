import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const allowedEmail = process.env.ALLOWED_EMAIL ?? "";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID ?? "",
      clientSecret: process.env.AUTH_GOOGLE_SECRET ?? "",
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      // Only allow the allowlisted email
      if (!user.email) return false;
      return user.email.toLowerCase() === allowedEmail.toLowerCase();
    },
    async session({ session }) {
      return session;
    },
  },
  pages: {
    signIn: "/",
    error: "/",
  },
  secret: process.env.AUTH_SECRET,
});
